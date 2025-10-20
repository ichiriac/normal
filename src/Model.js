const { Request } = require("./Request.js");
const { Record } = require("./Record.js");
const { Field } = require("./Fields.js");

function chainWith(BaseClass, MixinClass) {
    if (typeof MixinClass !== 'function') return BaseClass;

    // Ensure MixinClass participates in the chain so `super` inside mixin methods works.
    if (Object.getPrototypeOf(MixinClass.prototype) !== BaseClass.prototype) {
        Object.setPrototypeOf(MixinClass.prototype, BaseClass.prototype);
    }
    if (Object.getPrototypeOf(MixinClass) !== BaseClass) {
        Object.setPrototypeOf(MixinClass, BaseClass);
    }

    // Concrete subclass that keeps BaseClass constructor semantics.
    const Combined = class extends BaseClass {
        constructor(...args) {
            super(...args);
        }
    };
    Object.defineProperty (Combined, 'name', {value: MixinClass.name || 'Combined'});

    // Copy instance members (methods/accessors) preserving descriptors and super bindings.
    const inst = Object.getOwnPropertyDescriptors(MixinClass.prototype);
    delete inst.constructor;
    Object.defineProperties(Combined.prototype, inst);

    // Copy static members (except standard ones).
    const stat = Object.getOwnPropertyDescriptors(MixinClass);
    for (const key of Object.keys(stat)) {
        if (key === 'length' || key === 'name' || key === 'prototype') continue;
        Object.defineProperty(Combined, key, stat[key]);
    }

    return Combined;
}

/**
 * The lookup batching helper.
 */
class LookupIds {
    constructor(model) {
        this.model = model;
        this.ids = {};
        this._timeout = null;
    }

    lookup(ids) {
        const results = [];
        for (const id of ids) {
            if (!this.ids.hasOwnProperty(id)) {
                this.ids[id] = [];
            }
            let resolve, reject;
            const found = new Promise((res, rej) => {
                resolve = res;
                reject = rej;
            });
            this.ids[id].push([found, resolve, reject]);
            results.push(found);
        }
        if (this._timeout) clearTimeout(this._timeout);
        this._timeout = setTimeout(() => {
            this.fetch();
        }, 5);
        return Promise.all(results);
    }

    async fetch() {
        if (this._timeout) clearTimeout(this._timeout);
        this._timeout = null;
        let promises = this.ids;
        this.ids = {};
        let ids = Object.keys(promises);
        const rows = await this.model.query().whereIn('id', ids);
        const result = rows.map(row => {
            let instance = this.model.allocate(row);
            for (const [found, resolve, reject] of promises[row.id]) {
                resolve(instance);
            }
            delete promises[row.id];
            return instance;
        });
        // Handle not found
        for (const id of Object.keys(promises)) {
            for (const [found, resolve, reject] of promises[id]) {
                resolve(null);
            }
        }
        return result;
    }
}


function _inferTable(name) {
    return name.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

class Model {

    /**
     * A model representation.
     * @param {*} repo 
     * @param {*} name 
     * @param {*} table 
     * @param {*} fields 
     */
    constructor(repo, name, table = null) {
        this.repo = repo;
        this.name = name;
        this.table = table ? table : _inferTable(name);
        this.fields = {
            id: 'primary'
        };
        this.cls_init = false;
        this.cls = Record;
        this.indexes = [];
        this.entities = new Map();
        this._lookup = new LookupIds(this);
    }

    /**
     * Extend this model with a mixin class and additional fields.
     * @param {*} MixinClass 
     * @param {*} fields 
     */
    extends(MixinClass, fields = {}) {
        if (this.cls_init) {
            throw new Error("Model class already initialized");
        }
        Object.assign(this.fields, fields);
        if (typeof MixinClass === 'function') {
            this.cls = chainWith(this.cls, MixinClass);
        }
    }

    /**
     * Flush pending changes to the database.
     * @returns 
     */
    async flush() {
        for (const entity of this.entities.values()) {
            if (entity._isDirty) await entity.flush();
        }
        return this;
    }

    /**
     * Create a new query request.
     * @returns Request
     */
    query() {
        return new Request(this, this.repo.cnx(this.table));
    }

    /**
     * Create or update the database schema for this model.
     * @returns 
     */
    _buildSchema() {
        this._init();
        const kx = this.repo.cnx;
        return kx.schema.hasTable(this.table).then(async (exists) => {
            if (!exists) {
                await kx.schema.createTable(this.table, (table) => {
                    for (const fieldName of Object.keys(this.fields)) {
                        const field = this.fields[fieldName];
                        field.column(table);
                    }
                });
            } else {
                await kx.schema.alterTable(this.table, (table) => {
                    for (const fieldName of Object.keys(this.fields)) {
                        const field = this.fields[fieldName];
                        field.column(table);
                    }
                });
            }
        });
    }

    /**
     * Attach indexes to the database schema for this model.
     * @returns 
     */
    _buildIndex() {
        const kx = this.repo.cnx;
        return kx.schema.hasTable(this.table).then(async (exists) => {
            if (exists) {
                await kx.schema.alterTable(this.table, (table) => {
                    for (const fieldName of Object.keys(this.fields)) {
                        const field = this.fields[fieldName];
                        field.onIndex(table);
                    }
                });
            }
        });
    }

    /**
     * Lookup a list of ids, batching missing ids into a single query.
     * @param {int|Array<int>} ids 
     * @returns Promise<Array<Record>>
     */
    lookup(ids) {
        if (!Array.isArray(ids)) ids = [ids];
        const result = [];
        const missing = [];
        for (const id of ids) {
            if (this.entities.has(id)) {
                result.push(Promise.resolve(this.entities.get(id)));
            } else {
                missing.push(id);
            }
        }
        if (missing.length > 0) {
            result.push(this._lookup.lookup(missing));
        }
        
        return Promise.all(result);
    }

    /**
     * Initialize the model class by attaching fields.
     */
    _init() {
        if (!this.cls_init) {
            for (let fieldName of Object.keys(this.fields)) {
                const field = Field.define(this, fieldName, this.fields[fieldName]);
                this.fields[fieldName] = field;
                field.attach(this.cls);
            }
            this.cls.model = this;
            this.cls_init = true;
        }
    }

    /**
     * Allocate a record instance for the given data.
     * @param {*} data 
     * @returns 
     */
    allocate(data) {
        if (data.id) {
            if (this.entities.has(data.id)) {
                return this.entities.get(data.id).sync(data);
            }
        }
        if (!this.cls_init) this._init();
        const instance = new this.cls(this, data);
        if (data.id) {
            this.entities.set(data.id, instance);
        }
        return instance;
    }

    /**
     * Creates a new record in the database.
     * @param {*} data 
     * @returns 
     */
    async create(data) {

        if (!(data instanceof this.cls)) {
            data = this.allocate(data);
        }

        const toInsert = {};
        if (!this.cls_init) this._init();
        for (const fieldName of Object.keys(this.fields)) {
            const value = this.fields[fieldName].serialize(data);
            if (value !== undefined) {
                toInsert[fieldName] = value;
            }
        }

        const kx = this.repo.cnx;
        const table = this.table;
        const [id] = await kx(table)
            .insert(toInsert)
            .returning("id")
            .catch(async () => {
                // SQLite fallback (returning not supported)
                await kx(table).insert(toInsert);
                const row = await kx(table).orderBy("id", "desc").first("id");
                return [row?.id];
            });
        data.id = id.id ? id.id : id;

        

        return data;
    }

    /**
     * Find a record by its ID.
     * @param {*} id 
     * @returns 
     */
    async findById(id) {
        if (this.entities.has(id)) {
            return this.entities.get(id);
        }
        return await this.lookup(id).then(results => results[0]);
    }

    /**
     * Create a new query request.
     * @param  {...any} args 
     * @returns 
     */
    where(...args) {
        return this.query().where(...args);
    }

    /**
     * Find first record matching where clause.
     * @param {*} where 
     * @returns 
     */
    firstWhere(where) {
        return this.where(where).first();
    }
}

module.exports = { Model };
const { Request } = require("./Request.js");
const { Record } = require("./Record.js");
const { Field } = require("./Fields.js");

function chainWith(model, MixinClass) {
    const BaseClass = model.cls;
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
        const rows = await this.model.query().column(
            Object.keys(this.model.fields)
        ).whereIn('id', ids);
        const result = rows.map(row => {
            let instance = this.model.allocate(row);
            if (!promises[row.id]) {
                console.error('Unexpected missing promise for id ', row);
                return instance;
            }
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
        this.abstract = false;
        this.inherited = [];
        this.mixins = new Set();
        this.inherits = null;
        this.indexes = [];
        this.entities = new Map();
        this._lookup = new LookupIds(this);
    }

    /**
     * Extend this model with a mixin class and additional fields.
     * @param {*} MixinClass 
     * @param {*} fields 
     */
    extends(MixinClass) {
        if (this.cls_init) {
            throw new Error("Model class already initialized");
        }
        this.inherited.push(MixinClass);
        if (MixinClass.fields) {
            Object.assign(this.fields, MixinClass.fields);
        }
        if (MixinClass.inherits) {
            if (this.inherits && this.inherits !== MixinClass.inherits) {
                throw new Error("Model already inherits from " + this.inherits + ", cannot inherit from " + MixinClass.inherits + " as well.");
            }
            this.inherits = MixinClass.inherits;
        }
        if (MixinClass.abstract) {
            this.abstract = true;
        }
        if (MixinClass.mixins) {
            MixinClass.mixins.forEach((mix) => {
                this.mixins.add(mix);
            });
        }
        if (typeof MixinClass === 'function') {
            this.cls = chainWith(this, MixinClass);
        }
    }

    checkAbstract() {
        if (this.abstract) {
            throw new Error(`Cannot instantiate abstract model ${this.name}`);
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
        this.checkAbstract();
        return new Request(this, this.repo.cnx(this.table));
    }

    /**
     * Lookup a list of ids, batching missing ids into a single query.
     * @param {int|Array<int>} ids 
     * @returns Promise<Array<Record>>
     */
    lookup(ids) {
        this.checkAbstract();
        if (!Array.isArray(ids)) ids = [ids];
        const result = [];
        const missing = [];
        for (const id of ids) {
            const entity = this.entities.get(id);
            if (entity && entity._isReady) {
                result.push(Promise.resolve(entity));
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
        this.checkAbstract();
        if (!this.cls_init) {


            if (this.inherits) {
                const parentModel = this.repo.get(this.inherits);
                if (!parentModel.fields["_inherit"]) {
                    parentModel.fields["_inherit"] = Field.define(parentModel, "_inherit", {
                        type: 'reference', id_field: 'id', models: [this.name], required: true
                    });
                } else {
                    const inhField = parentModel.fields["_inherit"];
                    if (!inhField.models.includes(this.name)) {
                        inhField.models.push(this.name);
                    }
                }
                if (parentModel.mixins) {
                    parentModel.mixins.forEach((mix) => {
                        this.mixins.add(mix);
                    });
                }
            }

            this.mixins.forEach((mix) => {
                const mixin = this.repo.get(mix);
                if (mixin.fields) {
                    Object.assign(this.fields, mixin.fields);
                }
                this.cls = chainWith(this, mixin.cls);
            });

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
        this.checkAbstract();
        if (data.id) {
            if (this.entities.has(data.id)) {
                return this.entities.get(data.id).sync(data);
            }
        }
        if (!this.cls_init) this._init();
        const instance = new this.cls(this, data);
        if (data.id) {
            if (instance._isReady === false) {
                instance._isReady = this.lookup(data.id).then(function() {
                    instance._isReady = true;
                    return instance;
                }).catch(() => {
                    // record not found, mark as ready
                    instance._isReady = true;
                    delete instance.id;
                    return instance;
                });
            }
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
        this.checkAbstract();

        if (!this.cls_init) this._init();
        if (this.inherits) {
            const parentModel = this.repo.get(this.inherits);
            const parentRecord = await parentModel.create(Object.assign({}, data, {_inherit: this.name}));
            data.id = parentRecord.id;
        }

        if (!(data instanceof this.cls)) {
            data = this.allocate(data);
        }


        // prepare data to insert
        const toInsert = {};
        const pre_create = [];
        for (const fieldName of Object.keys(this.fields)) {
            const field = this.fields[fieldName];
            pre_create.push(field.pre_create(data));
            const value = field.serialize(data);
            if (value !== undefined) {
                toInsert[fieldName] = value;
            }
        }
        await Promise.all(pre_create);

        // insert record
        const kx = this.repo.cnx;
        const table = this.table;
        if (!this.inherits) {
            const [id] = await kx(table)
                .insert(toInsert)
                .returning("id")
                .catch(async () => {
                    // SQLite fallback (returning not supported)
                    await kx(table).insert(toInsert);
                    const row = await kx(table).orderBy("id", "desc").first("id");
                    return [row?.id];
                });
            if (data.id) {
                data.id = id.id ? id.id : id;
            }
        } else {
            await kx(table).insert(toInsert);
        }
        
        // create relations
        const post_create = [];
        for (const fieldName of Object.keys(this.fields)) {
            const field = this.fields[fieldName];
            post_create.push(field.post_create(data));
        }
        await Promise.all(post_create);

        return data;
    }

    /**
     * Find a record by its ID.
     * @param {*} id 
     * @returns 
     */
    async findById(id) {
        this.checkAbstract();
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
        this.checkAbstract();
        return this.query().where(...args);
    }

    /**
     * Find first record matching where clause.
     * @param {*} where 
     * @returns 
     */
    firstWhere(where) {
        this.checkAbstract();
        return this.where(where).first();
    }
}

module.exports = { Model };
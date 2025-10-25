const { Request } = require("./Request.js");
const { Record } = require("./Record.js");
const { Field } = require("./Fields.js");
const { extendModel } = require("./utils/extender");

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
        const cache = this.model.cache;
        for (const id of ids) {
            const entry = cache && cache.get(this.model.name + ':' + id);
            if (entry) {
                results.push(Promise.resolve(
                    this.model.allocate(entry)
                ));
                continue;
            }
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
        if (Object.keys(this.ids).length > 0) {
            if (this._timeout) clearTimeout(this._timeout);
            this._timeout = setTimeout(() => {
                this.fetch();
            }, 1);
        }
        return Promise.all(results);
    }

    async fetch() {
        if (this._timeout) clearTimeout(this._timeout);
        this._timeout = null;
        let promises = this.ids;
        this.ids = {};
        let ids = Object.keys(promises);
        const rows = await this.model.query().column(
            this.model.columns
        ).whereIn('id', ids);
        const result = rows.map(row => {
            let instance = this.model.allocate(row);
            if (this.model.cache && !this.model.repo.connection.transactional) {
                this.model.cache.set(this.model.name + ':' + instance.id, instance.toJSON(), this.model.cacheTTL);
            } else {
                instance._flushed = true;
            }
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
        this.fields = {};
        this.cls_init = false;
        this.cls = class ActiveRecord extends Record {};
        this.abstract = false;
        this.inherited = [];
        this.mixins = new Set();
        this.inherits = null;
        this.super = null;
        this.refField = null;
        this.primaryField = null;
        this.cacheTTL = null;
        this.indexes = [];
        this.entities = new Map();
        this._lookup = new LookupIds(this);
        this.inheritField = null;
        this.columns = [];
    }

    /**
     * Extend this model with a mixin class and additional fields.
     * @param {*} MixinClass 
     * @param {*} fields 
     */
    extends(MixinClass) {
        if (this.cls_init) {
            this.cls_init = false; // re-initialize
            this.entities.clear(); // clear existing entities
        }
        this.inherited.push(MixinClass);
        if (MixinClass.fields) {
            Object.assign(this.fields, MixinClass.fields);
        }
        if (MixinClass.hasOwnProperty('cache')) {
            if (MixinClass.cache === true) {
                this.cacheTTL = 300; // 5 minutes default
            } else {
                this.cacheTTL = Number.parseInt(MixinClass.cache, 10);
            }
        }
        if (MixinClass.inherits) {
            if (this.inherits && this.inherits !== MixinClass.inherits) {
                throw new Error("Model already inherits from " + this.inherits + ", cannot inherit from " + MixinClass.inherits + " as well.");
            }
            this.inherits = MixinClass.inherits;
            if (MixinClass.inheritField) {
                this.inheritField = MixinClass.inheritField;
            }
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
            extendModel(this, MixinClass);
        }
    }

    /**
     * Gets the cache instance if caching is enabled.
     */
    get cache() {
        if (this.cacheTTL !== null && this.cacheTTL > 0) {
            return this.repo.cache;
        }
        return null;
    }

    /**
     * Check if the model is abstract and throw an error if so.
     */
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
        this._init();
        return new Request(this, this.repo.cnx(this.table).queryContext({ model: this }));
    }

    /**
     * Lookup a list of ids, batching missing ids into a single query.
     * @param {int|Array<int>} ids 
     * @returns Promise<Array<Record>>
     */
    async lookup(ids) {
        this.checkAbstract();
        if (!Array.isArray(ids)) ids = [ids];
        const result = [];
        const missing = [];
        for (const id of ids) {
            const entity = this.entities.get(id);
            if (entity && entity._isReady) {
                result.push(entity);
            } else {
                missing.push(id);
            }
        }
        if (missing.length > 0) {
            return result.concat(
                await this._lookup.lookup(missing)
            );
        }
        return result;
    }

    /**
     * Initialize the model class by attaching fields.
     */
    _init() {
        this.checkAbstract();
        if (!this.cls_init) {


            if (this.inherits) {
                this.super = this.repo.get(this.inherits);
                if (!this.super.cls_init) {
                    this.super._init();
                }
                if (!this.inheritField) {
                    this.inheritField = this.super.refField?.name;
                }
                if (!this.inheritField) {
                    this.inheritField = '_inherit';
                }
                if (!this.super.fields[this.inheritField]) {
                    if (this.super.refField) {
                        throw new Error(`Model ${this.super.name} already has a reference field ${this.super.refField.name}, cannot create inherit field ${this.inheritField}`);
                    }
                    this.super.fields[this.inheritField] = Field.define(this.super, this.inheritField, {
                        type: 'reference', models: [this.name], required: true
                    });
                    this.super.refField = this.super.fields[this.inheritField];
                }
                this.inheritField = this.super.refField;
                if (!this.inheritField.models.includes(this.name)) {
                    this.inheritField.models.push(this.name);
                }
                if (this.super.mixins) {
                    this.super.mixins.forEach((mix) => {
                        this.mixins.add(mix);
                    });
                }
                for(const mix of this.super.inherited) {
                    extendModel(this, mix);
                }

                // Expose parent fields on child instances without polluting child's field map
                // so schema building stays correct. Define accessors that delegate to parent field.
                for (const [fname, pField] of Object.entries(this.super.fields)) {
                    if (fname === 'id') continue; // id already exists

                    if (Object.prototype.hasOwnProperty.call(this.fields, fname)) continue; // child's own field wins
                    Object.defineProperty(this.cls.prototype, fname, {
                        get: function() { return pField.read(this); },
                        set: function(v) { pField.write(this, v); },
                        configurable: true,
                        enumerable: true,
                    });
                }
            }

            this.mixins.forEach((mix) => {
                const mixin = this.repo.get(mix);
                if (mixin.fields) {
                    Object.assign(this.fields, mixin.fields);
                }
                extendModel(this, mixin.cls);
            });

            this.columns = [];
            for (let fieldName of Object.keys(this.fields)) {
                const field = Field.define(this, fieldName, this.fields[fieldName]);
                this.fields[fieldName] = field;
                field.attach(this, this.cls);
                if (field.stored) {
                    this.columns.push(field.column);
                }
                if (field.type === 'reference') {
                    this.refField = field;
                }
                if (field.type === 'primary') {
                    this.primaryField = field;
                }
            }
            if (!this.primaryField) {
                // Ensure primary field exists
                this.fields['id'] = Field.define(this, 'id', 'primary');
                this.fields['id'].attach(this, this.cls);
                this.columns.push(this.fields['id'].column);
                this.primaryField = this.fields['id'];
            }

            // For inherited models, include parent stored columns for select convenience
            if (this.super) {
                const cols = [];
                for (const p of Object.values(this.super.fields)) {
                    if (!p.stored) continue;
                    // qualify and alias as field name
                    cols.push(`${this.super.table}.${p.column} as ${p.name}`);
                }
                for (const c of Object.values(this.fields)) {
                    if (!c.stored) continue;
                    cols.push(`${this.table}.${c.column} as ${c.name}`);
                }
                this.columns = cols;
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
        // If allocating on a parent model and a discriminator/reference points to a child, delegate
        if (!this.inherits) {
            // detect discriminator on parent: find a reference field containing a model name
            const refField = Object.values(this.fields).find(f => f.type === 'reference');
            if (refField && data && data[refField.name]) {
                const childName = data[refField.name];
                if (childName && this.repo.has(childName)) {
                    // delegate to child; child will rehydrate needed fields as available
                    return this.repo.get(childName).allocate(data);
                }
            }
        }
        const instance = new this.cls(this, data);
        if (data.id) {
            this.entities.set(data.id, instance);
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
        }
        // If inheriting, hydrate parent fields from provided row when present
        if (this.inherits && data) {
            const parentModel = this.repo.get(this.inherits);
            for (const [fname, f] of Object.entries(parentModel.fields)) {
                if (!Object.prototype.hasOwnProperty.call(data, fname)) continue;
                instance._data[fname] = f.deserialize(instance, data[fname]);
                delete instance._changes[fname];
            }
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
        if (this.super) {
            const parentRecord = await this.super.create(Object.assign({}, data, {[this.inheritField.name]: this.name}));
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
                toInsert[field.column] = value;
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
            if (!data.id) {
                data.id = id.id ? id.id : id;
            }
        } else {
            await kx(table).insert(toInsert);
        }

        // flush data to cache
        if (this.cache && !this.repo.connection.transactional) {
            this.cache.set(this.name + ':' + data.id, data, this.cacheTTL);
        } else {
            data._flushed = true;
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
        this._init();
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
        this.checkAbstract();
        return this.where(where).first();
    }
}

module.exports = { Model };
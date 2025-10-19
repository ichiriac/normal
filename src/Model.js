const { Request } = require("./Request.js");
const { Record } = require("./Record.js");

function mixin(targetClass, ...mixins) {
  mixins.forEach(mixinClass => {
    Object.getOwnPropertyNames(mixinClass.prototype).forEach(name => {
      if (name !== 'constructor') {
        targetClass.prototype[name] = mixinClass.prototype[name];
      }
    });
  });
}

class LookupIds  {
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

export class Model {

    /**
     * A model representation.
     * @param {*} repo 
     * @param {*} name 
     * @param {*} table 
     * @param {*} fields 
     */
    constructor(repo, name, table, fields = {}, cls = null) {
        this.repo = repo;
        this.name = name;
        this.table = table;
        this.fields = {};
        this.cls = class extends Record {};
        this.extends(cls, fields);
        this.entities = new Map();
        this._lookup = new LookupIds(this);
    }

    /**
     * Extend this model with a mixin class and additional fields.
     * @param {*} MixinClass 
     * @param {*} fields 
     */
    extends(MixinClass, fields = {} ) {
        Object.assign(this.fields, fields);
        if (typeof MixinClass === 'function') {
            mixin(this.cls, MixinClass);
        }
    }

    async flush() {
        for(const entity of this.entities.values()) {
            await entity.flush();
        }
        return this;
    }

    /**
     * Create a new query request.
     * @returns Request
     */
    query() {
        return new Request(this, this.repo.knex(this.table));
    }

    /**
     * Lookup a list of ids, batching missing ids into a single query.
     * @param {*} ids 
     * @returns 
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
        if (missing.length === 0) {
            return Promise.resolve(result);
        }
        result.push(this._lookup.lookup(missing));
        return Promise.all(result);
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
        const instance = new this.cls(this, data);
        if (data.id) {
            this.entities.set(data.id, instance);
        }
        return instance;
    }

    async create(data) {
        const toInsert = { ...data };
        // Remove collection fields from insert
        for (const [k, spec] of Object.entries(fields)) {
            if (spec?.type === "collection") delete toInsert[k];
            if (
                spec?.type === "datetime" &&
                toInsert[k] == null &&
                typeof spec.default === "function"
            ) {
                toInsert[k] = spec.default();
            }
        }
        const [id] = await this.query()
            .insert(toInsert)
            .returning("id")
            .catch(async (e) => {
                // SQLite fallback (returning not supported)
                await kx(table).insert(toInsert);
                const row = await kx(table).orderBy("id", "desc").first("id");
                return [row?.id];
            });
        const row = await this.query()
            .where({ id: typeof id === "object" ? id.id : id })
            .first();
        const instance = repo._wrapInstance(cls, row, meta);

        // Handle initial many-to-many assignment via array of ids
        for (const [k, spec] of Object.entries(fields)) {
            if (spec?.type === "collection" && Array.isArray(data?.[k])) {
                const coll = instance[k];
                for (const v of data[k]) await coll.add(v);
            }
        }
        return instance;
    }
    async findById(id) {
        if (this.entities.has(id)) {
            return this.entities.get(id);
        }
        return await this.lookup(id).then(results => results[0]);
    }
    async where(...args) {
        await this.repo.flush();
        return await this.query().where(...args);
    }
    firstWhere(where) {
        return this.where(where).first();
    }
}

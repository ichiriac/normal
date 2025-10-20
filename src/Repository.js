"use strict";

const { Model } = require('./Model');


/**
 * Repository: registers model definitions and exposes CRUD over Knex.
 *
 * Contract expected by demo:
 * - new Repository(connection)
 * - register(modelClassOrModule)
 * - get(name) -> model handle
 * - sync({ force }) -> create/drop tables based on static fields
 * - transaction(fn) -> run work inside a knex transaction; fn gets a tx-bound repo
 *
 * Model shape (from demo models):
 *   class Users {
 *     static name = 'Users';
 *     static table = 'users';
 *     static fields = { id: { primary:true, generated:true }, ... }
 *     // optional getters/methods on prototype
 *   }
 *
 * Relations:
 *  - field type 'collection' with foreign: 'JoinTable.left_col' denotes a many-to-many via JoinTable
 *    Example: Posts.tags -> 'TagsPosts.post_id'; Tags.posts -> 'TagsPosts.tag_id'.
 */
class Repository {
  /** @param {import('./Connection').Connection|{ instance: any }} connection */
  constructor(connection) {
    this.connection = connection;
    /** @type {Record<string, any>} */
    this.models = {};
  }

  get cnx() {
    return this.connection.instance;
  }

  /**
   * Register a model class or an extension class
   */
  register(modelModule) {
    let ModelClass = modelModule?.default || modelModule;
    if (typeof ModelClass !== "function") {
      const result = {};
      for (let k of Object.keys(modelModule || {})) {
        if (typeof modelModule[k] !== "function") continue;
        result[k] = this.register(modelModule[k]);
      }
      return result;
    }
    const name = ModelClass.name || ModelClass?.name;
    if (!name) throw new Error("Model class must have a name");
    if (!this.models[name]) {
      this.models[name] = new Model(this, name, ModelClass.table);
    }
    this.models[name].extends(ModelClass, ModelClass.fields || {}); 
    return this.models[name];
  }

  /**
   * Get a registered model by name
   * @param {*} name 
   * @returns 
   */
  get(name) {
    const m = this.models[name];
    if (!m) throw new Error(`Model not registered: ${name}`);
    return m;
  }

  /** Drop and create tables based on registered models */
  async sync() {
    for (const name of Object.keys(this.models)) {
      const model = this.models[name];
      await model._buildSchema();
    }
    for (const name of Object.keys(this.models)) {
      const model = this.models[name];
      await model._buildIndex();
    }
    return this;
  }

  /** Run a function inside a transaction and expose a tx-bound repository */
  async transaction(work, config) {
    return await this.cnx.transaction({ isolationLevel: 'read committed' }, async (trx) => {
      const txRepo = new Repository({ instance: trx });
      // Re-register models with the same metadata
      for (const name of Object.keys(this.models)) {
        const model = this.models[name];
        let clone = Object.assign(Object.create(Object.getPrototypeOf(model)), model)
        txRepo.models[name] = clone;
        txRepo.models[name].repo = txRepo;
      }
      try {
        await work(txRepo);
        await txRepo.flush();
        await trx.commit();
      } catch (error) {
        // Handle error
        await trx.rollback();
        throw error;
      }
    }, config);
  }

  /**
   * Flush all changes into the database.
   * @returns 
   */
  async flush() {
    for (const name of Object.keys(this.models)) {
      const model = this.models[name];
      await model.flush();
    }
    return this;
  }

  // --------------------- internals ---------------------

  _makeCollectionProxy(
    joinTable,
    leftCol,
    rightCol,
    ownerTable,
    ownerId,
    targetTable
  ) {
    const kx = this.knex.instance || this.knex;
    const repo = this;
    return {
      async add(entityOrId) {
        const targetId =
          typeof entityOrId === "object" ? entityOrId.id : entityOrId;
        const row = {};
        row[leftCol] = ownerId;
        row[rightCol] = targetId;
        await kx(joinTable).insert(row);
      },
      async remove(entityOrId) {
        const targetId =
          typeof entityOrId === "object" ? entityOrId.id : entityOrId;
        const where = {};
        where[leftCol] = ownerId;
        where[rightCol] = targetId;
        await kx(joinTable).where(where).del();
      },
      async load() {
        // Select target rows joined through the join table
        const rows = await kx(targetTable)
          .join(joinTable, `${targetTable}.id`, `${joinTable}.${rightCol}`)
          .where(`${joinTable}.${leftCol}`, ownerId)
          .select(`${targetTable}.*`);
        // Wrap in their model class if registered
        const targetModel = Object.values(repo.meta).find(
          (m) => m.table === targetTable
        )?.cls;
        return rows.map((r) =>
          Object.assign(Object.create(targetModel?.prototype || {}), r)
        );
      },
    };
  }
}

module.exports = { Repository };

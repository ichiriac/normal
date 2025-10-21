"use strict";

const { Model } = require('./Model');
const { Cache } = require('./Cache');

const cache = new Cache({ max: 1024, entrySize: 1024 });

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

  /** @returns Knex instance */
  get cnx() {
    return this.connection.instance;
  }

  /** @returns Cache instance */
  get cache() {
    return cache;
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
    this.models[name].extends(ModelClass); 
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

  /**
   * Drop and create tables based on registered models
   * @returns this
   */
  async sync() {
    for (const name of Object.keys(this.models)) {
      const model = this.models[name];
      if (model.abstract) continue;
      await model._buildSchema();
    }
    for (const name of Object.keys(this.models)) {
      const model = this.models[name];
      if (model.abstract) continue;
      await model._buildIndex();
    }
    return this;
  }

  /** Run a function inside a transaction and expose a tx-bound repository */
  async transaction(work, config) {
    if (!config) config = {};
    if (!config.isolationLevel) {
      if (this.connection.config.client !== 'sqlite3') {
          config.isolationLevel = 'read committed';
      }
    }
    const trx = await this.cnx.transaction(config);
    const txRepo = new Repository({ instance: trx });
    let result
    // Re-register models with the same metadata
    for (const name of Object.keys(this.models)) {
      const model = this.models[name];
      txRepo.models[name] = new Model(txRepo, name, model.table);
      model.inherited.forEach((mix) => {
        txRepo.models[name].extends(mix);
      });
    }
    try {
      result = await work(txRepo);
      await txRepo.flush();
      await trx.commit();
    } catch (error) {
      // Handle error
      await trx.rollback();
      throw error;
    }
    return result;
  }

  /**
   * Flush all changes into the database.
   * @returns 
   */
  async flush() {
    for (const name of Object.keys(this.models)) {
      const model = this.models[name];
      if (model.abstract) continue;
      await model.flush();
    }
    return this;
  }
}

module.exports = { Repository };

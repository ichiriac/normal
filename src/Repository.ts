// @ts-nocheck - TODO: Add proper type annotations

import { Model } from './Model';
import { Synchronize } from './Schema.js';

// Initialize shared cache if enabled via environment variable
// Supported env vars (examples):
// - CACHE_DISABLED=1                 # disable cache completely
// - CACHE_ENGINE=arena|fixed         # choose storage engine (alias: CACHE_ARENA=1)
// - CACHE_ENTRY_SIZE=1024            # fixed engine: bytes per entry (default 1024 here)
// - CACHE_MAX_ENTRIES=2048           # fixed engine: number of slots
// - CACHE_MEMORY_BYTES=67108864      # arena: total memory (default 64MiB)
// - CACHE_BLOCK_SIZE=1024            # arena: block size for var-length storage
// - CACHE_DICT_CAPACITY=8192         # arena: initial dictionary capacity (keys)
// - CACHE_SWEEP_INTERVAL_MS=250      # arena: TTL sweeper interval
// - CACHE_SWEEP_CHECKS=512           # arena: entries to check per sweep tick
// - CACHE_CLUSTER=host1:1983,host2:1983  # peers for UDP invalidation
// - CACHE_PORT=1983                  # inbound UDP port (alias: CACHE_LISTEN_PORT)
// - CACHE_LISTEN_PORT=1983
// - CACHE_METRICS=1                  # enable/disable metrics (default enabled)
// - CACHE_METRICS_LOG_INTERVAL_MS=5000  # periodically log metrics
//
// Discovery protocol environment variables (per-Connection):
// - DISCOVERY_ENABLED=1              # enable UDP discovery (default: false)
// - DISCOVERY_MULTICAST_GROUP=239.255.1.1  # multicast group address
// - DISCOVERY_PORT=56789             # discovery UDP port
// - DISCOVERY_TTL=30000              # member TTL in milliseconds
// - DISCOVERY_ANNOUNCE_INTERVAL=10000  # keep-alive interval in ms
// - DISCOVERY_BOOTSTRAP_RETRIES=10   # number of rapid announcements on startup
// - DISCOVERY_PACKAGE_NAME=my-app    # override package name
// - DISCOVERY_PACKAGE_VERSION=1.0.0  # override package version
// - DISCOVERY_VERSION_POLICY=major,minor  # version compatibility policy
// - DISCOVERY_FALLBACK_SEEDS=host1:port,host2:port  # static seed nodes
// Note: Discovery is configured per Connection, not globally like cache

// Note: Cache is now per-connection, not global. Each Connection instance
// can have its own cache. Discovery integration automatically syncs discovered
// members as cache invalidation peers.

/**
 * Repository: registers model definitions and exposes CRUD and schema sync over a Knex connection.
 *
 * Contract:
 * - register(modelClassOrModule): register or extend models
 * - get(name): resolve a registered model
 * - has(name): check registration
 * - sync(options): create/drop tables from model fields (supports dry-run)
 * - transaction(fn): run work inside a knex transaction and commit+flush results
 * - flush(): persist pending changes for all models
 * - cache: cache instance from the connection (may be null if disabled)
 *
 * Models can be registered multiple times (extensions) and are merged by static name.
 */
class Repository {
  /**
   * @param {import('./Connection').Connection|{ instance: any, transactional?: boolean, config?: any }} connection Knex connection or a minimal wrapper
   */
  constructor(connection) {
    this.connection = connection;
    /** @type {Record<string, import('./Model').Model>} */
    this.models = {};
    /** Number of queries emitted on the underlying knex instance (best-effort). */
    this.queryCount = 0;
    // Track query count with a single listener; avoid duplicates across nested repos
    if (!this.cnx.__normalQueryListenerAttached) {
      const inc = () => {
        this.queryCount++;
      };
      this.cnx.on('query', inc);
      Object.defineProperty(this.cnx, '__normalQueryListenerAttached', {
        value: true,
        enumerable: false,
        configurable: false,
        writable: false,
      });
    }
  }

  /** Reset the query count to zero. */
  resetQueryCount() {
    this.queryCount = 0;
  }

  /** @returns {any} Knex instance */
  get cnx() {
    return this.connection.instance;
  }

  /**
   * Register a model class or an extension class/module.
   * If an object with multiple model classes is provided, registers each and
   * returns a map of model names to model handles.
   * @param {Function|Record<string, Function>|{ default?: Function }} modelModule
   * @returns {import('./Model').Model | Record<string, import('./Model').Model>}
   */
  register(modelModule) {
    let ModelClass = modelModule?.default || modelModule;
    if (typeof ModelClass !== 'function') {
      const result = {};
      for (let k of Object.keys(modelModule || {})) {
        if (typeof modelModule[k] !== 'function') continue;
        result[k] = this.register(modelModule[k]);
      }
      return result;
    }
    const name = ModelClass.name || ModelClass?.name;
    if (!name) throw new Error('Model class must have a name');
    if (!this.models[name]) {
      this.models[name] = new Model(this, name, ModelClass.table);
    }
    this.models[name].extends(ModelClass);
    if (!this.hasOwnProperty(name)) {
      Object.defineProperty(this, name, {
        get: () => this.models[name],
      });
    }
    return this.models[name];
  }

  /**
   * Get the cache instance from the connection
   * @returns {import('./Cache').Cache|null}
   */
  get cache() {
    // Try to get cache from connection if it's a Connection instance
    if (this.connection && typeof this.connection.getCache === 'function') {
      return this.connection.getCache();
    }
    return null;
  }

  /**
   * Get a registered model by name.
   * @param {string} name Model static name
   * @returns {import('./Model').Model}
   */
  get(name) {
    const m = this.models[name];
    if (!m) throw new Error(`Model not registered: ${name}`);
    return m;
  }

  /**
   * Check if a model is registered.
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    return !!this.models[name];
  }

  /** @typedef {{ dryRun?: boolean, force?: boolean }} SyncOptions */
  /**
   * Drop and create tables based on registered models.
   * @param {SyncOptions} [options] Control dry-run and force-drop behavior
   * @returns {Promise<string[]>} Executed SQL statements (or intended, if dryRun)
   */
  async sync(options = { dryRun: false, force: false }) {
    return await Synchronize(this, options);
  }

  /**
   * Run a function inside a transaction and expose a tx-bound repository.
   * The work function can return a value or a promise; its result is returned
   * after a successful commit. If an error occurs, the transaction is rolled back
   * and the error is rethrown.
   * @template T
   * @param {(repo: Repository) => Promise<T>|T} work
   * @param {{ isolationLevel?: string }} [config]
   * @returns {Promise<T>}
   */
  async transaction(work, config) {
    if (!config) config = {};
    if (!config.isolationLevel) {
      if (this.connection.config.client !== 'sqlite3') {
        config.isolationLevel = 'read committed';
      }
    }
    const trx = await this.cnx.transaction(config);
    const parentConnection = this.connection;
    const txRepo = new Repository({
      instance: trx,
      transactional: true,
      config: this.connection.config,
      // Provide accessors to shared services like cache/discovery from parent connection
      getCache() {
        return typeof parentConnection.getCache === 'function' ? parentConnection.getCache() : null;
      },
      getDiscovery() {
        return typeof parentConnection.getDiscovery === 'function'
          ? parentConnection.getDiscovery()
          : null;
      },
    });
    let result;
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
      // flushing to cache after commit
      for (const name of Object.keys(txRepo.models)) {
        const model = txRepo.models[name];
        if (model.cache) {
          for (const record of model.entities.values()) {
            if (record._flushed) {
              model.cache.set(model.name + ':' + record.id, record.toRawJSON(), model.cacheTTL);
            }
          }
        }
      }
    } catch (error) {
      // Handle error
      await trx.rollback();
      throw error;
    }
    return result;
  }

  /**
   * Flush all changes into the database for all non-abstract models.
   * @returns {Promise<this>}
   */
  async flush() {
    for (const name of Object.keys(this.models)) {
      const model = this.models[name];
      if (model.abstract) continue;
      await model.flush();
    }
    return this;
  }

  /**
   * Destroy the repository, flushing pending changes and closing the connection.
   */
  async destroy() {
    await this.flush();
    // Close connection if applicable
    if (this.connection && typeof this.connection.destroy === 'function') {
      await this.connection.destroy();
    }
    this.connection = null;
    this.models = {};
  }
}

export { Repository };

'use strict';

const { Model } = require('./Model');
const { Cache } = require('./Cache');
const { Synchronize } = require('./Schema.js');

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
/**
 * Parse a boolean-like env string ("1","true","yes" => true; "0","false","no" => false)
 * @param {any} v
 * @param {boolean} dft
 */
function envBool(v, dft) {
  if (v == null) return dft;
  const s = String(v).toLowerCase().trim();
  if (s === '1' || s === 'true' || s === 'yes' || s === 'on') return true;
  if (s === '0' || s === 'false' || s === 'no' || s === 'off') return false;
  return dft;
}
/**
 * Parse an integer env string with fallback
 * @param {any} v
 * @param {number} dft
 */
function envInt(v, dft) {
  if (v == null || v === '') return dft;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : dft;
}

const CACHE_DISABLED = envBool(process.env.CACHE_DISABLED, false);
let cache = null;
if (!CACHE_DISABLED) {
  const engine = (process.env.CACHE_ENGINE || '').toLowerCase();
  const variableArena = engine ? engine === 'arena' : envBool(process.env.CACHE_ARENA, false);

  /** @type {import('./Cache').CacheOptions} */
  const cacheOptions = {};
  if (variableArena) {
    cacheOptions.variableArena = true;
    cacheOptions.memoryBytes = envInt(process.env.CACHE_MEMORY_BYTES, 64 * 1024 * 1024);
    cacheOptions.blockSize = envInt(process.env.CACHE_BLOCK_SIZE, 1024);
    cacheOptions.dictCapacity = envInt(process.env.CACHE_DICT_CAPACITY, 8192);
    cacheOptions.sweepIntervalMs = envInt(process.env.CACHE_SWEEP_INTERVAL_MS, 250);
    cacheOptions.sweepChecks = envInt(process.env.CACHE_SWEEP_CHECKS, 512);
  } else {
    // Keep repo historical defaults when not provided
    cacheOptions.entrySize = envInt(process.env.CACHE_ENTRY_SIZE, 1024);
    cacheOptions.maxEntries = envInt(process.env.CACHE_MAX_ENTRIES, 2048);
  }

  // Common options
  if (process.env.CACHE_CLUSTER) {
    cacheOptions.cluster = String(process.env.CACHE_CLUSTER)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (process.env.CACHE_PORT) cacheOptions.port = envInt(process.env.CACHE_PORT, 1983);
  if (process.env.CACHE_LISTEN_PORT)
    cacheOptions.listenPort = envInt(process.env.CACHE_LISTEN_PORT, 1983);
  cacheOptions.metrics = envBool(process.env.CACHE_METRICS, true);
  if (process.env.CACHE_METRICS_LOG_INTERVAL_MS) {
    cacheOptions.metricsLogIntervalMs = envInt(process.env.CACHE_METRICS_LOG_INTERVAL_MS, 0);
  }

  cache = new Cache(cacheOptions);
}

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
 * - cache: shared cache instance (may be null if disabled)
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
    this.cnx.on('query', () => {
      this.queryCount++;
    });
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
    return this.models[name];
  }

  /**
   * Get the shared cache instance
   * @returns {import('./Cache').Cache|null}
   */
  get cache() {
    return cache;
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
    const txRepo = new Repository({
      instance: trx,
      transactional: true,
      config: this.connection.config,
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
}

module.exports = { Repository };

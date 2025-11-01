/**
 * Shared Memory Cache Implementation
 *
 * Uses a variable-length ArenaStore for storage with BlockArena
 *
 * Cluster invalidation and metrics are delegated to dedicated modules.
 *
 * @example
 * const { Cache } = require('./src/Cache');
 * const cache = new Cache({ variableArena: true, dictCapacity: 4096 });
 * cache.set('foo', { bar: 1 }, 60);
 * const val = cache.get('foo'); // => { bar: 1 }
 */
/**
 * @typedef {Object} CacheOptions
 * @property {boolean} [variableArena] Deprecated, ignored. ArenaStore is always used.
 * @property {number} [memoryBytes=67108864] Arena: total bytes to allocate for the arena
 * @property {number} [blockSize=1024] Arena: block size in bytes used to chain variable-length values
 * @property {number} [dictCapacity=8192] Arena: initial dictionary capacity (number of keys)
 * @property {string|string[]|Array<[string,number]>} [cluster] Cluster peers as "host:port", an array of strings, or [host,port] tuples
 * @property {number} [port=1983] UDP port to listen on for invalidations (alias: listenPort)
 * @property {number} [listenPort=1983] UDP port alias for inbound invalidations
 * @property {number} [sweepIntervalMs=250] Arena: sweep interval in milliseconds for TTL cleanup
 * @property {number} [sweepChecks=512] Arena: number of entries to check per sweep tick
 * @property {boolean} [metrics=true] Enable metrics collection and timing
 * @property {number} [metricsLogIntervalMs] If set, periodically logs metrics every N milliseconds
 */
const { ArenaStore } = require('./cache/ArenaStore');
const { ClusterTransport, parsePeers } = require('./cache/Cluster');
const { CacheMetrics } = require('./cache/Metrics');

class SharedMemoryCache {
  /**
   * Create a shared memory cache instance.
   * When {@link CacheOptions.variableArena} is true, uses a variable-length arena store.
   * Otherwise falls back to a fixed-slot, direct-mapped store.
   *
   * Cluster invalidations are received on {@link CacheOptions.port} / {@link CacheOptions.listenPort}
   * and sent to peers defined by {@link CacheOptions.cluster}.
   *
   * @param {CacheOptions} [options]
   */
  constructor(options = {}) {
    // Expose a compatibility property when provided by callers/tests
    // Note: ArenaStore doesn't use fixed max entries; this is retained only for tests/options pass-through.
    this.maxEntries = options.maxEntries;
    // Cluster config
    this.clusterPeers = parsePeers(options.cluster, options.port || options.listenPort || 1983);
    this.listenPort = options.port || options.listenPort || 1983;
    this._batchIntervalMs = 500;

    // Metrics
    this._metrics = new CacheMetrics(options.metrics !== false);

    // Storage engine: always ArenaStore
    this.arena = new ArenaStore({
      memoryBytes: options.memoryBytes || 64 * 1024 * 1024,
      blockSize: options.blockSize || 1024,
      dictCapacity: options.dictCapacity || 8192,
    });

    // Cluster transport (inbound + outbound batching)
    this._cluster = new ClusterTransport({
      listenPort: this.listenPort,
      peers: this.clusterPeers,
      onKeys: (keys) => {
        for (const k of keys) this.expire(k, false);
      },
      batchIntervalMs: this._batchIntervalMs,
      onFlush: (count) => this._metrics.onUdpFlush(count),
    });

    // Background sweeper
    this._sweepTimer = null;
    const sweepEveryMs = options.sweepIntervalMs || 250;
    const sweepChecks = options.sweepChecks || 512;
    this._sweepTimer = setInterval(() => {
      try {
        const res = this.arena.sweep(sweepChecks);
        this._metrics.onSweep(res);
      } catch (_) { }
    }, sweepEveryMs);
    this._sweepTimer.unref?.();

    // Optional periodic metrics logging
    if (this._metrics.enabled && options.metricsLogIntervalMs) {
      const every = options.metricsLogIntervalMs;
      this._metricsTimer = setInterval(() => {
        // eslint-disable-next-line no-console
        console.log('[Cache metrics]', this.metrics());
      }, every);
      this._metricsTimer.unref?.();
    }
  }

  /**
   * Store a value with a time-to-live.
  * Values can be arbitrary JSON-serializable objects.
   *
   * On success, schedules an invalidation broadcast to cluster peers.
   *
   * @param {string|number} key Cache key
   * @param {any} value Value to store (JSON-serializable recommended)
   * @param {number} [ttl=300] Time to live in seconds (minimum 1s)
   * @returns {boolean} true if stored, false otherwise
   */
  set(key, value, ttl = 300) {
    const m = this._metrics;
    const t0 = m.setStart();
    const ok = this.arena.put(String(key), value, Math.max(1, Math.floor(ttl)));
    if (ok) this._cluster.queue(String(key));
    m.setEnd(t0);
    return ok;
  }

  /**
   * Retrieve a value by key if present and not expired.
   * @param {string|number} key Cache key
   * @returns {any|null} Previously stored value or null when missing/expired
   */
  get(key) {
    const m = this._metrics;
    const t0 = m.getStart();
    const out = this.arena.get(String(key));
    if (out == null) {
      m.getMiss(t0);
      return null;
    }
    m.getHit(t0);
    return out;
  }

  /**
   * Clear all entries in the local cache.
   * Does not broadcast to peers.
   * @returns {void}
   */
  clear() {
    this.arena.clear();
  }

  /**
   * Expire a single key locally and optionally broadcast to peers.
   * @param {string|number} key Cache key to expire
   * @param {boolean} [broadcast=false] When true, enqueue an invalidation message to peers
   * @returns {void}
   */
  expire(key, broadcast = false) {
    this._metrics.incExpire();
    this.arena.delete(String(key));
    if (broadcast) this._cluster.queue(String(key));
  }

  /**
   * Capture a snapshot of current metrics counters and timings.
   * @returns {object} Plain object with counters and durations
   */
  metrics() {
    return this._metrics.snapshot();
  }

  /**
   * Reset all metrics counters and timers to zero.
   * @returns {void}
   */
  resetMetrics() {
    this._metrics.reset();
  }
}

module.exports = { Cache: SharedMemoryCache };

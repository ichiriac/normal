/**
 * Shared Memory Cache Implementation
 *
 * Uses a variable-length ArenaStore for storage with BlockArena
 *
 * Cluster invalidation and metrics are delegated to dedicated modules.
 *
 * @example
 * import { Cache } from './src/Cache';
 * const cache = new Cache({ variableArena: true, dictCapacity: 4096 });
 * cache.set('foo', { bar: 1 }, 60);
 * const val = cache.get('foo'); // => { bar: 1 }
 */
interface CacheOptions {
  enabled?: boolean;
  variableArena?: boolean; // deprecated, ignored
  memoryBytes?: number;
  blockSize?: number;
  dictCapacity?: number;
  cluster?: string | string[] | Array<[string, number]>;
  port?: number;
  listenPort?: number;
  sweepIntervalMs?: number;
  sweepChecks?: number;
  metrics?: boolean;
  metricsLogIntervalMs?: number;
  maxEntries?: number;
}
import { ArenaStore } from './cache/ArenaStore';
import { ClusterTransport, parsePeers } from './cache/Cluster';
import { CacheMetrics } from './cache/Metrics';

// Structural interfaces for collaborators (minimal surfaces used here)
interface ArenaStoreLike {
  put(key: string, value: unknown, ttlSeconds: number): boolean;
  get(key: string, minCreatedMs?: number): unknown | null;
  clear(): void;
  delete(key: string): void;
  sweep(sampleCount: number): unknown;
}

interface ClusterTransportLike {
  queue(key: string): void;
}

interface CacheMetricsLike {
  enabled: boolean;
  setStart(): number;
  setEnd(t0: number): void;
  getStart(): number;
  getHit(t0: number): void;
  getMiss(t0: number): void;
  onSweep(res: unknown): void;
  onUdpFlush(count: number): void;
  incExpire(): void;
  snapshot(): Record<string, unknown>;
  reset(): void;
}

class SharedMemoryCache {
  // Public/testing-visible
  maxEntries?: number;
  clusterPeers: Array<{ host: string; port: number }>;
  listenPort: number;

  // Internals
  private _batchIntervalMs: number;
  private _metrics: CacheMetricsLike;
  private arena: ArenaStoreLike;
  private _cluster: ClusterTransportLike;
  private _sweepTimer: (NodeJS.Timeout & { unref?: () => void }) | null;
  private _metricsTimer?: (NodeJS.Timeout & { unref?: () => void });
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
  constructor(options: CacheOptions = {}) {
    // Expose a compatibility property when provided by callers/tests
    // Note: ArenaStore doesn't use fixed max entries; this is retained only for tests/options pass-through.
    this.maxEntries = options.maxEntries;
    // Cluster config
    this.clusterPeers = parsePeers(
      options.cluster as any,
      options.port || options.listenPort || 1983
    ) as Array<{ host: string; port: number }>;
    this.listenPort = options.port || options.listenPort || 1983;
    this._batchIntervalMs = 500;

    // Metrics
    this._metrics = new CacheMetrics(options.metrics !== false) as unknown as CacheMetricsLike;

    // Storage engine: always ArenaStore
    this.arena = new ArenaStore({
      memoryBytes: options.memoryBytes || 64 * 1024 * 1024,
      blockSize: options.blockSize || 1024,
      dictCapacity: options.dictCapacity || 8192,
    }) as unknown as ArenaStoreLike;

    // Cluster transport (inbound + outbound batching)
    this._cluster = new ClusterTransport({
      listenPort: this.listenPort,
      peers: this.clusterPeers,
  onKeys: (keys: string[]) => {
        for (const k of keys) {
          if (k[0] === '$') {
            // Special re-insert command: $key:ttl:json_value
            const [key, ttl, valJson] = k.split(':');
            try {
              const val = JSON.parse(valJson);
              this.set(key, val, Number(ttl), false);
            } catch {
              // Ignore malformed JSON
            }
            continue;
          } else {
            this.expire(k, false);
          }
        }
      },
      batchIntervalMs: this._batchIntervalMs,
      onFlush: (count: number) => this._metrics.onUdpFlush(count),
    } as any) as unknown as ClusterTransportLike;

    // Background sweeper
    this._sweepTimer = null;
    const sweepEveryMs = options.sweepIntervalMs || 250;
    const sweepChecks = options.sweepChecks || 512;
    this._sweepTimer = setInterval(() => {
      try {
        const res = this.arena.sweep(sweepChecks);
        this._metrics.onSweep(res);
      } catch (_) {}
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
  set(key: string | number, value: unknown, ttl: number = 300, broadcast: boolean = true): boolean {
    const m = this._metrics;
    const t0 = m.setStart();
    const keyStr = String(key);
    const ok = this.arena.put(keyStr, value, Math.max(1, Math.floor(ttl)));
    if (broadcast && ok) {
      let outKey = keyStr;
      if (outKey[0] === '$') {
        // Special re-insert command: $key:ttl:json_value
        outKey += ':' + ttl + ':' + JSON.stringify(value);
      }
      this._cluster.queue(outKey);
    }
    m.setEnd(t0);
    return ok;
  }

  /**
   * Retrieve a value by key if present and not expired.
   * Optionally pass a minimum creation timestamp; entries created before this
   * timestamp are treated as expired even if TTL has not elapsed.
   * @param {string|number} key Cache key
   * @param {number} [minCreatedMs] Minimum creation timestamp (ms since epoch)
   * @returns {any|null} Previously stored value or null when missing/expired
   */
  get(key: string | number, minCreatedMs?: number): unknown | null {
    const m = this._metrics;
    const t0 = m.getStart();
    const out = this.arena.get(String(key), minCreatedMs);
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
  clear(): void {
    this.arena.clear();
  }

  /**
   * Expire a single key locally and optionally broadcast to peers.
   * @param {string|number} key Cache key to expire
   * @param {boolean} [broadcast=false] When true, enqueue an invalidation message to peers
   * @returns {void}
   */
  expire(key: string | number, broadcast: boolean = false): void {
    this._metrics.incExpire();
    this.arena.delete(String(key));
    if (broadcast) this._cluster.queue(String(key));
  }

  /**
   * Capture a snapshot of current metrics counters and timings.
   * @returns {object} Plain object with counters and durations
   */
  metrics(): Record<string, unknown> {
    return this._metrics.snapshot();
  }

  /**
   * Reset all metrics counters and timers to zero.
   * @returns {void}
   */
  resetMetrics(): void {
    this._metrics.reset();
  }
}

export { SharedMemoryCache as Cache };

---
id: cache
title: Cache and Discovery
---

This page explains NormalJS’s in-memory cache, how to configure it on the connection, how request and model caches work, and how peer discovery keeps caches in sync across processes.

## Overview

- Engine: a shared-memory JSON cache backed by a variable-length arena (ArenaStore/BlockArena). Entries are TTL-based and periodically swept.
- Scope: cache is per-Connection. Each Repository created from a Connection uses that Connection’s cache.
- Layers:
  - Entry cache: per-record keys like `Model:ID` used by lookups and after writes.
  - Request cache: per-request keys for query results, opt-in via `.cache(ttl)` on requests.
  - Model invalidation marker: `$ModelName` timestamp used to treat request-cache entries older than the marker as expired (does not evict entry cache).
- Cluster: optional UDP peer invalidation to keep caches coherent across nodes connected to the same database.

## Quick start

```js
const conn = new Connection({
  client: 'sqlite3',
  connection: { filename: ':memory:' },
  cache: {
    enabled: true,
    memoryBytes: 64 * 1024 * 1024,
    dictCapacity: 8192,
    // cluster: 'host1:1983,host2:1983', // optional peers
  },
});
const repo = new Repository(conn);

class Users {
  static name = 'Users';
  static fields = { id: 'primary', email: 'string' };
  static cache = 300; // enable model cache, TTL in seconds
  static cacheInvalidation = true; // auto-invalidate request cache on writes/unlinks
}

repo.register(Users);

// Request-level cache (per query)
const rows = await repo.get('Users').where({ active: true }).cache(60);

// Evict request cache for this model (entry cache remains)
repo.get('Users').invalidateCache();
```

## Connection cache options

Pass these under `new Connection({ cache: { ... } })`:

- enabled: boolean — Set to false to disable cache.
- maxEntries: number — Compatibility property (not enforced by Arena); useful for tests/config tracking.
- memoryBytes: number — Total arena memory (default 64 MiB).
- blockSize: number — Arena block size for variable-length chaining (default 1024 bytes).
- dictCapacity: number — Initial dictionary capacity (keys) (default 8192).
- sweepIntervalMs: number — TTL sweeper tick interval (default 250 ms).
- sweepChecks: number — Entries examined per sweep tick (default 512).
- metrics: boolean — Enable metrics (default true).
- metricsLogIntervalMs: number — If set, periodically logs metrics snapshots.
- cluster: string | string[] — Peers as `"host:port"` or comma-separated string to receive invalidations.
- port / listenPort: number — UDP port to bind for inbound invalidations (default 1983).

Notes:

- The engine stores JSON values; TTL units are seconds (minimum 1 second).
- Metrics are accessible via `cache.metrics()` and can be reset with `cache.resetMetrics()`.

## Discovery and cluster invalidation

Discovery is configured per-Connection and used to automatically set cache peers with the same database identity.

How it works:

- Each Connection can create a Discovery instance (`connection.getDiscovery()`).
- Discovery tracks members and exposes `getMembers()`; the repository sync selects only members with a matching `connectionHash()` (same DB).
- Cache peers are updated from discovery events; the cache transport then batches and sends UDP invalidation keys to peers.

Common discovery options (via `new Connection({ discovery: { ... } })`):

- enabled: boolean — Start discovery (default true when requested, otherwise off).
- packageName, packageVersion: strings — App identity (auto-detected from nearest package.json if not provided).
- secret, connectionHash: strings — Derived from connection config; used to scope discovery members.
- multicast group/port, TTLs, announce intervals — See environment variable section below.

Environment variables (reference):

- DISCOVERY_ENABLED, DISCOVERY_MULTICAST_GROUP, DISCOVERY_PORT,
  DISCOVERY_TTL, DISCOVERY_ANNOUNCE_INTERVAL, DISCOVERY_BOOTSTRAP_RETRIES,
  DISCOVERY_PACKAGE_NAME, DISCOVERY_PACKAGE_VERSION, DISCOVERY_VERSION_POLICY,
  DISCOVERY_FALLBACK_SEEDS

Cache peers may also be set statically via the Connection `cache.cluster` option without Discovery.

## Request caching

- Enable per-request caching by calling `.cache(ttlSeconds)` on a request.
- When model cache is enabled (see next section), read queries select just the `id` by default; allocation fills records lazily using the entry cache or DB.
- Request cache keys are of the form:
  - `ModelName:` + JSON.stringify(knex.\_statements)
- Invalidation: request cache entries older than `$ModelName` marker are treated as expired. Use `Model.invalidateCache()` or enable automatic invalidation via `static cacheInvalidation = true` on the model.

## Model cache

Enable model-level caching by setting a static `cache` property on the model:

```js
class Posts {
  static name = 'Posts';
  static fields = { id: 'primary', title: 'string' };
  static cache = true; // default 300s; or set a number of seconds
}
```

Semantics:

- Entry cache (per-id): keys like `Posts:123` are written on lookups, creates, and updates. On `unlink()`, the per-id key is expired immediately.
- Request cache (per-query): only set when you call `.cache(ttl)` on the request; stored under the per-request key.
- Model.invalidateCache(): writes `$Posts` with current timestamp; request-cache reads compare their entry creation time with this marker and treat older cache as expired. Entry cache is not removed by this marker.
- Automatic invalidation: set `static cacheInvalidation = true` on the model to call `invalidateCache()` after writes/links/unlinks.

TTL units are seconds in all of the above.

## Transactions and cache

- Inside `Repository.transaction()`, the tx-bound repository shares the parent connection’s cache and discovery.
- After a successful commit, any records marked as flushed during the transaction are set into the entry cache (`Model:ID`) using the model TTL.
- This makes request and entry caching effective inside transactions without duplicating cache instances.

## Keys and eviction

- Entry: `Model:ID` — expires on unlink, updated on flush/write; TTL applies.
- Request: `Model:JSON.stringify(knex._statements)` — present only when using `.cache(ttl)`.
- Model marker: `$Model` — timestamp of last invalidation. Request cache older than this is treated as expired; entry cache unaffected.

Cluster invalidation:

- Per-id expiry uses key broadcast to peers.
- Model markers are broadcast as special re-insert messages so peers update their marker timestamp (internal detail; no action required by consumers).

## Metrics

`cache.metrics()` returns counters and timing (ops, hits/misses, sweeps, UDP batches/keys, latencies). Use it to observe hit rates and tune `dictCapacity`, `blockSize`, and sweep parameters.

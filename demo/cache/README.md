# Cache Showcase

This demo showcases NormalJS ORM’s shared cache with multiple related models and a simulated visitor workload.

Models included:

- Posts (many-to-one Category, many-to-many Tags, one-to-many Comments)
- Categories (one-to-many Posts)
- Tags (many-to-many Posts)
- Comments (many-to-one Post)

The script seeds random data:

- 1,000 posts
- 100 categories
- 200 tags
- 500 comments

Then it simulates visitors who:

- browse random categories (listing posts)
- read random posts (and add comments sometimes)
- search posts by random tags

For each run, it measures elapsed time and counts SQL queries using the repository’s `queryCount`. It compares two child processes: one without cache and one with cache enabled, so you can see the impact.

## Run it

By default, it forks twice: one child with cache disabled and one with cache enabled. Metrics are printed at the end.

```
node demo/cache/index.js
```

You can control the cache engine with environment variables. For example:

```
# Force arena engine
CACHE_ENGINE=arena node demo/cache/index.js

# Force fixed engine
CACHE_ENGINE=fixed node demo/cache/index.js
```

For a quicker run (smaller dataset), you can tune the workload via env:

```
POSTS=100 CATEGORIES=20 TAGS=40 COMMENTS=200 VISITORS=8 STEPS=30 node demo/cache/index.js
```

Relevant cache env options (see `src/Repository.js` for full list):

- CACHE_DISABLED=1 — disable cache entirely
- CACHE_ENGINE=arena|fixed — pick arena (variable-length) or fixed slots
- CACHE_ARENA=1 — alias for arena engine
- CACHE_ENTRY_SIZE, CACHE_MAX_ENTRIES — sizing for fixed engine
- CACHE_MEMORY_BYTES, CACHE_BLOCK_SIZE, CACHE_DICT_CAPACITY — sizing for arena engine
- CACHE_SWEEP_INTERVAL_MS, CACHE_SWEEP_CHECKS — TTL sweeping for arena
- CACHE_METRICS=1 — enable metrics, CACHE_METRICS_LOG_INTERVAL_MS to log periodically

## How caching works across forks

The cache is created in `Repository` at module load time based on env variables. Each child process gets its own in-process cache instance, and processes can coordinate invalidations via UDP when configured with `CACHE_CLUSTER`. This design lets you compare behavior across forks: run one child with `CACHE_DISABLED=1` and another with `CACHE_ENGINE=arena` to see the difference.

## Output

You’ll see a summary like:

Example from a quick run on this machine:

```
Results
-------
No Cache: time=300.05ms, queries=426, engine=fixed, cache=false
With Cache: time=103.30ms, queries=252, engine=arena, cache=true

Arena Cache metrics snapshot:
{
	enabled: true,
	uptimeSec: 0.37,
	counts: {
		set: 518,
		get: 989,
		hit: 837,
		miss: 152,
		expire: 0,
		sweeps: 1,
		sweepFreed: 0,
		udpBatches: 0,
		udpKeys: 0
	},
	latencyUs: {
		avgSet: 26.666,
		avgGet: 9.496,
		maxSet: 519.907,
		maxGet: 251.256,
		lastSet: 26.486,
		lastGet: 24.668
	}
}
```

Note: numbers vary with hardware, Node version, and the randomness of the workload.

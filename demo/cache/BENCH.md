# Cache Benchmark (demo/cache)

This micro-benchmark evaluates the in-process shared cache in Arena mode (BlockArena-backed, variable-length store) and reports throughput, latency, counts, and memory deltas. Fixed-slot mode has been removed from the project.

## What it measures

For each Arena scenario (parameters):

- Warm-up: Pre-fills the cache with N keys
- Timed workload:
  - Set loop (setOps)
  - Get loop (getOps)
- Reports:
  - elapsed seconds and throughput (ops/sec overall and per op type)
  - latency (µs): average, max, last for set/get (from high-resolution timers)
  - counts: set, get, hit, miss, expire, sweeps, sweepFreed, udpBatches, udpKeys
  - memory Δ (bytes): RSS and heap deltas across the run

No network invalidation is used (no peers), so UDP metrics remain zero.

For a broader comparison of “No Cache” vs “With Cache (Arena)”, use the interactive demo in `demo/cache/index.js`, which runs two child processes: one with caching disabled and one with the Arena cache enabled, and summarizes elapsed time and query counts.

## Scenarios and tunables

Environment variables (with defaults):

- BENCH_ENTRIES: number of unique keys (default: 20000)
- BENCH_SET_OPS: number of set operations (default: 50000)
- BENCH_GET_OPS: number of get operations (default: 100000)
- BENCH_PAYLOADS: comma-separated payload sizes in bytes (default: `64,512,1024,4096`)

Each payload size runs two scenarios:

- Arena mode (1KB blocks): `memoryBytes = 64MB`, `blockSize = 1024`, `dictCapacity ≈ nextPow2(entries * 2)`
- Arena mode (512B blocks): same as above, but `blockSize = 512`

You can tweak `memoryBytes`, `blockSize`, `dictCapacity`, `sweepIntervalMs`, and `sweepChecks` in `bench.js` or by forking the scenarios.

## How to run

- Using npm script:
  - `npm run bench`
- With overrides, for a quick run:
  - `BENCH_ENTRIES=2000 BENCH_SET_OPS=2000 BENCH_GET_OPS=4000 BENCH_PAYLOADS=64 npm run bench`

## Example results (quick run)

Example collected on the dev container (Linux, Node.js) with:

- `BENCH_ENTRIES=2000 BENCH_SET_OPS=2000 BENCH_GET_OPS=4000 BENCH_PAYLOADS=64`

Arena (block=1024B, dict=4096):

- elapsed: ~0.030 s
- throughput: ~201k ops/s (set ~67k/s, get ~134k/s)
- latency (us): avgSet ~5, avgGet ~4, maxSet ~200, maxGet ~516
- counts: set 2000, get 4000, hit 4000, miss 0
- memory Δ: rss ~258–271 MB (includes one or more 64MB arenas allocated across scenarios); heap small

Arena (block=512B, dict=4096):

- elapsed: ~0.018 s
- throughput: ~327k ops/s (set ~109k/s, get ~218k/s)
- latency (us): avgSet ~4, avgGet ~2, maxSet ~271, maxGet ~185
- counts: set 2000, get 4000, hit 4000, miss 0
- memory Δ: rss ~128–135 MB (64MB arena plus overhead)

## Interpreting the results

- Throughput and latency: Arena exhibits very low per-op latency (single-digit microseconds on these runs) and high throughput.
- Arena memory usage: Arena reserves `memoryBytes` in a SharedArrayBuffer; RSS delta roughly reflects this reservation.
- Arena hit rate: The arena store now automatically rehashes (doubles dictionary capacity) on insertion failures, which restores a high hit-rate under load. You can still start with a larger `dictCapacity` (e.g., ≥ 2–4× entries) to avoid rehash pauses. Ensure `memoryBytes` is large enough to accommodate both the dictionary and data blocks.

## Tuning tips

- Arena mode:
  - Prefer `dictCapacity >= 2×` to `4×` the number of live keys to reduce probe chains and insertion failures; auto-rehash will kick in if it’s too small.
  - Choose `blockSize` to match value sizes: 512B for smaller payloads, 1024B+ for larger ones to reduce block chaining.
  - `memoryBytes` caps total storage (dictionary + blocks). Larger values reduce allocation failures.
  - The background sweeper frees only expired chains; if everything has long TTLs, free cycles will be low by design.
  - For consistent memory deltas, run scenarios in separate processes or reuse the same arena and call `clear()` between runs (each new arena allocates its own SharedArrayBuffer).

## Known limitations (prototype)

- Arena mode dictionary behavior under high load still needs tuning. If you observe low hit rates:
  - Raise `dictCapacity` (≥ 4× entries)
  - Verify keys/values fit: extremely large values require more blocks and can exhaust the free list
  - Ensure `memoryBytes` isn’t too small after accounting for the dictionary region

'use strict';

// Micro-benchmark for SharedMemoryCache using built-in metrics
// Scenarios compare fixed-slot mode vs BlockArena variable-length mode across payload sizes.

const { Cache } = require('../../src/Cache');

function fmt(n) {
  return typeof n === 'number' ? n.toLocaleString() : n;
}
function fmtUs(n) {
  return Math.round(n).toLocaleString() + ' µs';
}

function mem() {
  const m = process.memoryUsage();
  return { rss: m.rss, heapUsed: m.heapUsed, heapTotal: m.heapTotal };
}

function diffMem(a, b) {
  const d = {};
  for (const k of Object.keys(a)) d[k] = b[k] - a[k];
  return d;
}

function makeValue(bytes) {
  // Create a JSON-friendly string payload with the requested length (approximate)
  // Using a simple repeat keeps encoding overhead small and deterministic.
  return 'x'.repeat(bytes);
}

async function runScenario(
  name,
  { cacheOptions, entries = 10000, payloadSize = 1024, setOps = 50000, getOps = 100000 }
) {
  console.log(`\n=== Scenario: ${name} ===`);
  console.log(
    `entries=${fmt(entries)} payload=${fmt(payloadSize)}B setOps=${fmt(setOps)} getOps=${fmt(getOps)}`
  );

  const val = makeValue(payloadSize);
  const keys = Array.from({ length: entries }, (_, i) => 'k' + i);

  const beforeMem = mem();
  const cache = new Cache(cacheOptions);

  // Warm-up: fill the cache once
  for (let i = 0; i < entries; i++) cache.set(keys[i], val, 60);

  cache.resetMetrics();
  const t0 = process.hrtime.bigint();

  // Write workload
  for (let i = 0; i < setOps; i++) {
    const k = keys[i % entries];
    cache.set(k, val, 60);
  }

  // Read workload
  for (let i = 0; i < getOps; i++) {
    const k = keys[i % entries];
    cache.get(k);
  }

  const t1 = process.hrtime.bigint();
  const afterMem = mem();
  const elapsedSec = Number(t1 - t0) / 1e9;

  const m = cache.metrics();
  const totalOps = (m.counts?.set || 0) + (m.counts?.get || 0);
  const opsPerSec = totalOps / elapsedSec;
  const setPerSec = (m.counts?.set || 0) / elapsedSec;
  const getPerSec = (m.counts?.get || 0) / elapsedSec;
  const memDelta = diffMem(beforeMem, afterMem);

  console.log('elapsed:', elapsedSec.toFixed(3), 's');
  console.log(
    'throughput:',
    fmt(Math.round(opsPerSec)),
    'ops/s',
    `(set ${fmt(Math.round(setPerSec))}/s, get ${fmt(Math.round(getPerSec))}/s)`
  );
  if (m.latencyUs) {
    console.log(
      'latency (us):',
      `avgSet ${fmtUs(m.latencyUs.avgSet)}, avgGet ${fmtUs(m.latencyUs.avgGet)}, maxSet ${fmtUs(m.latencyUs.maxSet)}, maxGet ${fmtUs(m.latencyUs.maxGet)}`
    );
  }
  console.log('counts:', m.counts);
  console.log('memory Δ (bytes):', {
    rss: memDelta.rss,
    heapUsed: memDelta.heapUsed,
    heapTotal: memDelta.heapTotal,
  });
}

function nextPow2(n) {
  return 1 << (32 - Math.clz32(n - 1));
}

async function main() {
  const entries = Number(process.env.BENCH_ENTRIES || 20000);
  const setOps = Number(process.env.BENCH_SET_OPS || 50000);
  const getOps = Number(process.env.BENCH_GET_OPS || 100000);
  const payloads = (process.env.BENCH_PAYLOADS || '64,512,1024,4096')
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter(Boolean);

  for (const payloadSize of payloads) {
    // Fixed-slot mode: size big enough to hold JSON entry comfortably.
    const entrySize = Math.max(512, payloadSize * 2 + 256);
    await runScenario(`fixed-slot entrySize=${entrySize}`, {
      cacheOptions: { maxEntries: entries, entrySize, metrics: true },
      entries,
      payloadSize,
      setOps,
      getOps,
    });

    // Arena mode with 1KB blocks
    const dictCapacity = nextPow2(entries * 2);
    await runScenario(`arena block=1024B dict=${dictCapacity}`, {
      cacheOptions: {
        variableArena: true,
        memoryBytes: 64 * 1024 * 1024,
        blockSize: 1024,
        dictCapacity,
        metrics: true,
        sweepIntervalMs: 100,
        sweepChecks: 2048,
      },
      entries,
      payloadSize,
      setOps,
      getOps,
    });

    // Arena mode with 512B blocks (potentially denser for small payloads)
    await runScenario(`arena block=512B dict=${dictCapacity}`, {
      cacheOptions: {
        variableArena: true,
        memoryBytes: 64 * 1024 * 1024,
        blockSize: 512,
        dictCapacity,
        metrics: true,
        sweepIntervalMs: 100,
        sweepChecks: 2048,
      },
      entries,
      payloadSize,
      setOps,
      getOps,
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

'use strict';

const { extendWith } = require('../src/utils/extender');
const {
  BaseHeavy,
  MixinHeavyNoSuper,
  MixinHeavyWithSuper,
} = require('./bench-fixtures/extendWith.classes');

// High-resolution timer
function nowNs() {
  return process.hrtime.bigint();
}
function nsToMs(ns) {
  return Number(ns) / 1e6;
}

// Warm-up both code paths: without super and with super
function warmup() {
  let C;
  for (let i = 0; i < 200; i++) {
    C = extendWith(BaseHeavy, MixinHeavyNoSuper);
  }
  for (let i = 0; i < 200; i++) {
    C = extendWith(BaseHeavy, MixinHeavyWithSuper);
  }
  return C;
}

function benchCreateN(N, Base, Mixin) {
  const created = new Array(N);
  const start = nowNs();
  for (let i = 0; i < N; i++) created[i] = extendWith(Base, Mixin);
  const elapsedMs = nsToMs(nowNs() - start);
  // Prevent DCE
  if (typeof created[created.length - 1] !== 'function') throw new Error('bad');
  return elapsedMs;
}

const UNDER_COVERAGE = typeof globalThis.__coverage__ !== 'undefined';
// Use more forgiving thresholds to avoid flakiness on shared/dev hardware
const NO_SUPER_MIN = UNDER_COVERAGE ? 8 : 20;
const WITH_SUPER_MIN = UNDER_COVERAGE ? 8 : 15;

describe('extendWith performance (class creation)', () => {
  test(`no-super path: creation throughput >= ${NO_SUPER_MIN} ops/ms`, () => {
    warmup();
    const run = function () {
      const elapsedMs = benchCreateN(100, BaseHeavy, MixinHeavyNoSuper);
      const opsPerMs = 100 / Math.max(elapsedMs, 0.000001);
      return opsPerMs;
    };

    let opsPerMs = run();
    if (opsPerMs < NO_SUPER_MIN) {
      // Rerun once to avoid fluke failures
      console.log('Rerunning no-super benchmark due to low ops/ms...');
      opsPerMs = run();
    }
    console.log('No-super ops/ms:', opsPerMs.toFixed(2));
    expect(opsPerMs).toBeGreaterThanOrEqual(NO_SUPER_MIN);
  });

  test(`with-super path: creation throughput >= ${WITH_SUPER_MIN} ops/ms`, () => {
    warmup();
    const run = function () {
      const elapsedMs = benchCreateN(100, BaseHeavy, MixinHeavyWithSuper);
      const opsPerMs = 100 / Math.max(elapsedMs, 0.000001);
      return opsPerMs;
    };
    let opsPerMs = run();
    if (opsPerMs < WITH_SUPER_MIN) {
      console.log('Rerunning with-super benchmark due to low ops/ms...');
      opsPerMs = run();
    }
    console.log('With-super ops/ms:', opsPerMs.toFixed(2));
    expect(opsPerMs).toBeGreaterThanOrEqual(WITH_SUPER_MIN);
  });
});

'use strict';

const { Cache } = require('../src/Cache');

describe('Cache (FixedSlots)', () => {
  test('set/get/expire/clear and metrics', () => {
    const cache = new Cache({ variableArena: false, metrics: true });

    // Miss initially
    expect(cache.get('k1')).toBeNull();

    // Set and get
    expect(cache.set('k1', { a: 1 }, 1)).toBe(true);
    const val = cache.get('k1');
    expect(val).toEqual({ a: 1 });

    // Expire locally (no broadcast)
    cache.expire('k1');
    expect(cache.get('k1')).toBeNull();

    // Set again and clear all
    cache.set('k2', 123, 1);
    cache.clear();
    expect(cache.get('k2')).toBeNull();

    const m1 = cache.metrics();
    expect(typeof m1).toBe('object');
    expect(m1.enabled).toBe(true);
    expect(m1.counts && typeof m1.counts.get).toBe('number');

    // After reset, all counters should return to 0 and be <= previous snapshot
    cache.resetMetrics();
    const m2 = cache.metrics();
    expect(m2.enabled).toBe(true);
    expect(m2.counts.set).toBe(0);
    expect(m2.counts.get).toBe(0);
    expect(m2.counts.hit).toBe(0);
    expect(m2.counts.miss).toBe(0);
    expect(m2.counts.expire).toBe(0);
    expect(m2.counts.sweeps).toBe(0);

    // Sanity: reset values should not exceed the previous snapshot
    expect(m2.counts.get).toBeLessThanOrEqual(m1.counts.get);
    expect(m2.counts.hit).toBeLessThanOrEqual(m1.counts.hit);
    expect(m2.counts.miss).toBeLessThanOrEqual(m1.counts.miss);
  });
});

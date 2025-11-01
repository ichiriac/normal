'use strict';

const { Cache } = require('../src/Cache');
const { Request } = require('../src/Request');
const { Model } = require('../src/Model');

describe('invalidateCache()', () => {
    test('evicts request-level cache but preserves entry (Model:ID) cache', async () => {
        // Real cache instance
        const cache = new Cache({ metrics: false, dictCapacity: 256 });

        // Minimal model instance wired to the cache
        const repo = { cache, connection: { transactional: false } };
        const model = new Model(repo, 'M', 'm');
        // Enable model-level cache usage
        model.cacheTTL = 60; // seconds
        model.columns = ['id'];
        model.fields = { id: {} };

        // -------- Entry cache baseline --------
        // Seed an entry cache value that should NOT be evicted by invalidateCache
        const entryKey = 'M:1';
        const entryVal = { id: 1, source: 'entry-cache' };
        cache.set(entryKey, entryVal, 120);

        // -------- Request-level cache warm-up --------
        // Stable QB that can simulate a database select
        const rows = [{ id: 1, name: 'row-1' }];
        const qb = {
            _method: 'select',
            _statements: [{ grouping: 'columns', value: ['id'] }, { grouping: 'where', value: { id: 1 } }],
            select() {
                return this; // chainable
            },
            then: jest.fn((onFulfilled) => Promise.resolve(rows).then(onFulfilled)),
            finally: (f) => (typeof f === 'function' ? f() : undefined),
            toString: () => 'SQL',
            toSQL: () => ({ sql: 'SQL' }),
        };

        // Avoid full Model field initialization during wrapping
        model.allocate = (row) => row;
        const req = new Request(model, qb).cache(30);

        // 1st run -> miss, executes QB, stores in request cache
        await new Promise((resolve, reject) => req.then(resolve, reject));
        expect(qb.then).toHaveBeenCalledTimes(1);

        // 2nd run (no invalidation yet) -> served from request cache (no QB call)
        await new Promise((resolve, reject) => req.then(resolve, reject));
        expect(qb.then).toHaveBeenCalledTimes(1);

        // Sanity: entry cache present BEFORE invalidation
        expect(cache.get(entryKey)).toEqual(entryVal);

        // -------- Invalidate --------
        model.invalidateCache();

        // 3rd run -> request-level cache must be treated as expired, QB called again
        await new Promise((resolve, reject) => req.then(resolve, reject));
        expect(qb.then).toHaveBeenCalledTimes(2);

        // Entry cache should remain intact AFTER invalidation
        expect(cache.get(entryKey)).toEqual(entryVal);
    });

    test('lookup() continues to use entry cache after invalidateCache()', async () => {
        const cache = new Cache({ metrics: false, dictCapacity: 256 });
        const repo = { cache, connection: { transactional: false } };
        const model = new Model(repo, 'U', 'users');
        model.cacheTTL = 60;
        model.columns = ['id'];
        model.fields = { id: {} };

        // Stub allocate to return a record-like object compatible with LookupIds.fetch expectations
        model.allocate = (row) => ({
            ...row,
            toRawJSON: () => ({ ...row }),
        });

        // Spyable, stubbed query builder for LookupIds.fetch
        let fetchCount = 0;
        const rowsFromDb = [{ id: 42, name: 'db' }];
        model.query = () => ({
            column: () => ({
                whereIn: () => {
                    fetchCount++;
                    return Promise.resolve(rowsFromDb);
                },
            }),
        });

        // First lookup: cache miss -> triggers one fetch, seeds entry cache
        const r1 = await model.lookup(42);
        expect(Array.isArray(r1)).toBe(true); // lookup(id) returns an array
        expect(r1.length).toBe(1);
        expect(fetchCount).toBe(1);

        // Second lookup: served from entry cache (no additional fetch)
        const r2 = await model.lookup(42);
        expect(fetchCount).toBe(1);

        // Invalidate request-level cache
        model.invalidateCache();

        // Third lookup: should STILL be served from entry cache (fetch count unchanged)
        const r3 = await model.lookup(42);
        expect(fetchCount).toBe(1);
        expect(Array.isArray(r3)).toBe(true);
        expect(r3[0] && r3[0].id).toBe(42);
    });
});

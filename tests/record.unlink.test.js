'use strict';

const { Record } = require('../src/Record');

describe('Record.unlink()', () => {
  test('unlinks record: calls hooks, deletes in DB, expires cache, invalidates model cache, emits event, clears entities', async () => {
    const deleteFn = jest.fn(() => Promise.resolve());
    const whereFn = jest.fn(() => ({ delete: deleteFn }));
    const queryFn = jest.fn(() => ({ where: whereFn }));

    const cache = { expire: jest.fn() };
    const entities = { delete: jest.fn() };
    const events = { emit: jest.fn() };

    const model = {
      name: 'M',
      query: queryFn,
      fields: {}, // no field-level hooks for this test
      cache,
      cacheInvalidation: true,
      invalidateCache: jest.fn(),
      entities,
      events,
    };

    // Parent record mock to verify it's called
    const parent = { unlink: jest.fn(async () => {}), sync: jest.fn() };

    const rec = new Record(model, {}, parent);
    rec.id = 1; // ensure id is present for where clause and cache key

    // Spy on instance-level hooks
    const preUnlinkSpy = jest.spyOn(rec, 'pre_unlink');
    const postUnlinkSpy = jest.spyOn(rec, 'post_unlink');

    const out = await rec.unlink();

    // Returns same instance
    expect(out).toBe(rec);

    // DB deletion path invoked correctly
    expect(queryFn).toHaveBeenCalled();
    expect(whereFn).toHaveBeenCalledWith({ id: 1 });
    expect(deleteFn).toHaveBeenCalled();

    // Hooks executed
    expect(preUnlinkSpy).toHaveBeenCalled();
    expect(postUnlinkSpy).toHaveBeenCalled();

    // Parent unlink called
    expect(parent.unlink).toHaveBeenCalledTimes(1);

    // Cache entry expired and model-level invalidation triggered
    expect(cache.expire).toHaveBeenCalledWith('M:1');
    expect(model.invalidateCache).toHaveBeenCalledTimes(1);

    // Event emitted
    expect(events.emit).toHaveBeenCalledWith('unlink', rec);

    // Entity removed and model cleared from record
    expect(entities.delete).toHaveBeenCalledWith(1);
    expect(rec._model).toBeNull();
  });

  test('unlinks without cache and without cacheInvalidation, and no parent', async () => {
    const deleteFn = jest.fn(() => Promise.resolve());
    const whereFn = jest.fn(() => ({ delete: deleteFn }));
    const queryFn = jest.fn(() => ({ where: whereFn }));

    const entities = { delete: jest.fn() };
    const events = { emit: jest.fn() };

    const model = {
      name: 'NOCACHE',
      query: queryFn,
      fields: {},
      cache: null, // no cache
      cacheInvalidation: false,
      invalidateCache: jest.fn(),
      entities,
      events,
    };

    const rec = new Record(model, {});
    rec.id = 7;

    const out = await rec.unlink();

    expect(out).toBe(rec);
    expect(queryFn).toHaveBeenCalled();
    expect(whereFn).toHaveBeenCalledWith({ id: 7 });
    expect(deleteFn).toHaveBeenCalled();

    // No cache expiry or invalidation when not configured
    expect(model.invalidateCache).not.toHaveBeenCalled();

    // Event emitted and entity deleted
    expect(events.emit).toHaveBeenCalledWith('unlink', rec);
    expect(entities.delete).toHaveBeenCalledWith(7);
    expect(rec._model).toBeNull();
  });
});

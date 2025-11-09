// @ts-nocheck - Test file with implicit any types


import { Request  } from '../src/Request';

describe('Request internals', () => {
  function makeQB() {
    const qb = {
      _method: 'select',
      _statements: [],
      selected: null,
      select(arg) {
        this.selected = arg;
        return this;
      },
      first: jest.fn(async () => ({ id: 1, name: 'x' })),
      then: jest.fn((onFulfilled) => onFulfilled([{ id: 1 }, { id: 2 }])),
      finally: jest.fn((f) => f()),
      toString: () => 'SQL',
      toSQL: () => ({ sql: 'SQL' }),
    };
    return qb;
  }

  test('_shouldWrapResults detects write methods', () => {
    const model = { name: 'M', table: 'm', columns: ['id'] };
    const qb = makeQB();
    const req = new Request(model, qb);
    qb._method = 'update';
    expect(req._shouldWrapResults()).toBe(false);
    qb._method = 'delete';
    expect(req._shouldWrapResults()).toBe(false);
    qb._method = 'select';
    expect(req._shouldWrapResults()).toBe(true);
    qb._method = undefined; // default wrap
    expect(req._shouldWrapResults()).toBe(true);
  });

  test('_getRequestKey stringifies statements', () => {
    const model = { name: 'M', table: 'm', columns: ['id'] };
    const qb = makeQB();
    qb._statements.push(
      { grouping: 'columns', value: ['id'] },
      { grouping: 'where', value: { id: 1 } }
    );
    const req = new Request(model, qb);
    const key = req._getRequestKey();
    expect(typeof key).toBe('string');
    expect(key.startsWith('M:')).toBe(true);
    // misc passthrough helpers
    expect(req.toString()).toBe('SQL');
    expect(req.toSQL().sql).toBe('SQL');
    req.finally(() => {});
  });

  test('_ensureDefaultIdSelect selects columns based on cache presence', () => {
    const qb1 = makeQB();
    const model1 = { name: 'M', table: 'm', columns: ['id', 'name'], cache: null };
    const req1 = new Request(model1, qb1);
    req1._ensureDefaultIdSelect();
    expect(qb1.selected).toEqual(['id', 'name']);

    const qb2 = makeQB();
    const model2 = {
      name: 'M',
      table: 'm',
      columns: ['id', 'name'],
      cache: {
        /* truthy */
      },
    };
    const req2 = new Request(model2, qb2);
    req2._ensureDefaultIdSelect();
    expect(qb2.selected).toBe('m.id');

    // When columns already specified, do not override
    const qb3 = makeQB();
    qb3._statements.push({ grouping: 'columns', value: ['foo'] });
    const req3 = new Request(model1, qb3);
    req3._ensureDefaultIdSelect();
    expect(qb3.selected).toBe(null);

    // For write-like methods, do nothing
    const qb4 = makeQB();
    qb4._method = 'insert';
    const req4 = new Request(model1, qb4);
    req4._ensureDefaultIdSelect();
    expect(qb4.selected).toBe(null);
  });

  test('_wrapResult wraps rows and calls ready() when present', async () => {
    const model = {
      name: 'M',
      fields: { id: {}, name: {} },
      allocate: jest.fn((row) => ({
        ...row,
        ready: jest.fn(async () => ({ ...row, wrapped: true })),
      })),
    };
    const req = new Request(model, makeQB());
    const single = await req._wrapResult({ id: 1, name: 'x' });
    expect(single.wrapped).toBe(true);

    const many = await req._wrapResult([
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
    ]);
    expect(Array.isArray(many)).toBe(true);
    expect(many.length).toBe(2);
    expect(many[0].wrapped).toBe(true);

    // Non-wrappable returns as-is
    const notWrapped = await req._wrapResult('string');
    expect(notWrapped).toBe('string');
  });

  test('_isWrappableRow edge cases', () => {
    const model = { fields: { id: {}, name: {} }, cls: function C() {} };
    const req = new Request(model, makeQB());
    expect(req._isWrappableRow(null)).toBe(false);
    expect(req._isWrappableRow([1, 2])).toBe(false);
    expect(req._isWrappableRow({ foo: 1 })).toBe(false);
    expect(req._isWrappableRow({ id: 1 })).toBe(true);
    // If already instance of model.cls, do not wrap
    const inst = new model.cls();
    expect(req._isWrappableRow(inst)).toBe(false);
  });

  test('then(): cache miss stores result and wraps', async () => {
    const qb = makeQB();
    const cache = { get: jest.fn(() => null), set: jest.fn() };
    const model = { name: 'M', table: 'm', columns: ['id'], cache };
    const req = new Request(model, qb).cache(60);
    // Force wrapping to a known value
    req._wrapResult = jest.fn(async (v) => 'wrapped');
    const out = await new Promise((resolve, reject) => req.then(resolve, reject));
    expect(cache.get).toHaveBeenCalled();
    expect(cache.set).toHaveBeenCalled();
    expect(out).toBe('wrapped');
  });

  test('then(): cache hit returns wrapped cached value without hitting QB', async () => {
    const qb = makeQB();
    qb.then = jest.fn(() => {
      throw new Error('QB should not be called on cache hit');
    });
    const cached = [{ id: 1 }];
    const cache = { get: jest.fn(() => cached), set: jest.fn() };
    const model = { name: 'M', table: 'm', columns: ['id'], cache };
    const req = new Request(model, qb).cache(30);
    req._wrapResult = jest.fn(async (v) => 'wrapped2');
    const out = await new Promise((resolve, reject) => req.then(resolve, reject));
    expect(cache.get).toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
    expect(out).toBe('wrapped2');
  });
});

// @ts-nocheck - Test file with implicit any types


import { MiddlewareSystem, DatabaseContext  } from '../src/Middleware';

describe('MiddlewareSystem', () => {
  test('executes middlewares in order and calls next once', async () => {
    const mw = new MiddlewareSystem();
    const calls = [];
    mw.use('op', async (ctx, next) => {
      calls.push('a');
      ctx.a = 1;
      return next();
    });
    mw.use('op', async (ctx, next) => {
      calls.push('b');
      ctx.b = ctx.a + 1;
      return next();
    });
    mw.use('op', async (ctx, next) => {
      calls.push('c');
      return { done: true, ctx };
    });

    const ctx = new DatabaseContext('op', 'tbl');
    const res = await mw.execute('op', ctx);

    expect(calls).toEqual(['a', 'b', 'c']);
    expect(res.done).toBe(true);
    expect(res.ctx.a).toBe(1);
    expect(res.ctx.b).toBe(2);
  });

  test('throws if next called multiple times', async () => {
    const mw = new MiddlewareSystem();
    mw.use('op', async (ctx, next) => {
      await next();
      return next();
    });
    await expect(mw.execute('op', new DatabaseContext('op', 't'))).rejects.toThrow(
      'next() called multiple times'
    );
  });

  test('cacheMiddleware caches query results by key and sets fromCache', async () => {
    const mw = new MiddlewareSystem();
    const cacheMw = mw.cacheMiddleware(1000); // 1s
    const ctx = new DatabaseContext('query', 'users', { query: { id: 1 } });

    const next = jest.fn(async () => ({ data: { id: 1, name: 'A' } }));
    // First call populates cache
    let res = await cacheMw(ctx, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.data).toEqual({ id: 1, name: 'A' });

    // Second call hits cache and flags fromCache
    const ctx2 = new DatabaseContext('query', 'users', { query: { id: 1 } });
    res = await cacheMw(ctx2, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(ctx2.fromCache).toBe(true);
    expect(ctx2.result).toEqual({ id: 1, name: 'A' });
  });

  test('versioningMiddleware assigns version and updatedAt on create/update; stores previous versions', async () => {
    const mw = new MiddlewareSystem();
    const verMw = mw.versioningMiddleware();

    // Create
    const createCtx = new DatabaseContext('create', 'posts', { data: { id: 10, title: 't' } });
    let res = await verMw(createCtx, async () => ({ data: { id: 10, title: 't' } }));
    expect(res.data._version).toBe(1);
    expect(typeof res.data._updatedAt).toBe('string');

    // Update with previousData
    const updateCtx = new DatabaseContext('update', 'posts', {
      id: 10,
      data: { id: 10, title: 't2' },
      previousData: { id: 10, title: 't' },
    });
    res = await verMw(updateCtx, async () => ({ data: { id: 10, title: 't2' } }));
    expect(res.data._version).toBe(2);
    const history = mw.getVersionHistory('posts', 10);
    expect(history.length).toBe(1);
    expect(history[0].data).toEqual({ id: 10, title: 't' });
  });

  test('validationMiddleware validates required and type', async () => {
    const mw = new MiddlewareSystem();
    const schema = {
      id: { required: true, type: 'number' },
      name: { required: true, type: 'string' },
    };
    const valMw = mw.validationMiddleware(schema);

    await expect(
      valMw(new DatabaseContext('create', 't', { data: { name: 'A' } }), async () => ({}))
    ).rejects.toThrow(/id is required/);

    await expect(
      valMw(new DatabaseContext('update', 't', { data: { id: 1, name: 2 } }), async () => ({}))
    ).rejects.toThrow(/name must be of type string/);

    const ok = await valMw(
      new DatabaseContext('create', 't', { data: { id: 1, name: 'A' } }),
      async () => ({ msg: 'ok' })
    );
    expect(ok).toEqual({ msg: 'ok' });
  });

  test('loggingMiddleware logs start and end; propagates errors', async () => {
    const mw = new MiddlewareSystem();
    const logMw = mw.loggingMiddleware();
    const spyLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    const spyErr = jest.spyOn(console, 'error').mockImplementation(() => {});

    const ctx = new DatabaseContext('create', 'logs', { data: { id: 1 } });
    const res = await logMw(ctx, async () => ({ data: { id: 1 } }));
    expect(res.data.id).toBe(1);
    expect(spyLog).toHaveBeenCalled();

    await expect(
      logMw(new DatabaseContext('create', 'logs', { data: { id: 2 } }), async () => {
        throw new Error('x');
      })
    ).rejects.toThrow('x');
    expect(spyErr).toHaveBeenCalled();

    spyLog.mockRestore();
    spyErr.mockRestore();
  });

  test('helper methods: cache and versions clear', () => {
    const mw = new MiddlewareSystem();
    mw.cache.set('k', { data: 1 });
    mw.versions.set('v', [{ a: 1 }]);
    mw.clearCache();
    mw.clearVersions();
    expect(mw.cache.size).toBe(0);
    expect(mw.versions.size).toBe(0);
  });
});

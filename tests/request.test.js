const { Request } = require('../src/Request');

describe('Request', () => {
  const createModel = (allocateSpy = jest.fn((row) => ({ ...row, wrapped: true }))) => ({
    allocate: allocateSpy,
    cls: function Record() {},
    fields: {
      id: {},
      name: {},
    },
  });

  const createQueryBuilder = (rows) => {
    const promise = Promise.resolve(rows);
    return {
      _method: 'select',
      then: (onFulfilled, onRejected) => promise.then(onFulfilled, onRejected),
      catch: (onRejected) => promise.catch(onRejected),
      finally: (onFinally) => promise.finally(onFinally),
      toString: () => 'select * from table',
      toSQL: () => ({ sql: 'select * from table' }),
    };
  };

  test('wraps select results via model.allocate', async () => {
    const rows = [{ id: 1, name: 'Ada' }];
    const model = createModel();
    const qb = createQueryBuilder(rows);

    const request = new Request(model, qb);
    const result = await request;

    expect(model.allocate).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ id: 1, name: 'Ada', wrapped: true }]);
  });

  test('first() wraps single row via allocate', async () => {
    const row = { id: 2, name: 'Grace' };
    const model = createModel();
    const qb = {
      _method: 'first',
      first: () => Promise.resolve(row),
      then: (onFulfilled, onRejected) => Promise.resolve([row]).then(onFulfilled, onRejected),
      catch: (onRejected) => Promise.resolve([row]).catch(onRejected),
      finally: (onFinally) => Promise.resolve([row]).finally(onFinally),
      toString: () => 'select * from table limit 1',
      toSQL: () => ({ sql: 'select * from table limit 1' }),
    };

    const request = new Request(model, qb);
    const result = await request.first();

    expect(model.allocate).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: 2, name: 'Grace', wrapped: true });
  });
});

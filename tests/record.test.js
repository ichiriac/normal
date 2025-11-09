'use strict';

const { Connection, Repository } = require('..');

describe('Record behaviors', () => {
  let conn;
  let repo;

  beforeAll(async () => {
    conn = new Connection({ client: 'sqlite3', connection: { filename: ':memory:' } });
    await conn.connect();
    repo = new Repository(conn);
    class Thing {
      static _name = 'Thing';
      static fields = {
        id: 'primary',
        name: { type: 'string', required: true },
        count: { type: 'integer' },
      };
    }
    repo.register(Thing);
    await repo.sync({ force: true });
  });

  afterAll(async () => {
    await conn.destroy();
  });

  test('write() applies changes and flush persists to DB', async () => {
    const Things = repo.get('Thing');
    const t = await Things.create({ name: 'A', count: 1 });
    expect(t._isDirty).toBe(false);

    // apply change and flush via write()
    const out = await t.write({ count: 2 });
    expect(out).toBe(t);
    expect(t._isDirty).toBe(false);

    const fetched = await Things.findById(t.id);
    expect(fetched.count).toBe(2);
  });

  test('write() rejects unknown fields', async () => {
    const Things = repo.get('Thing');
    const t = await Things.create({ name: 'B', count: 0 });
    await expect(t.write({ nope: 1 })).rejects.toThrow(/does not exist on model/);
  });

  test('toJSON serializes fields; sync() clears changes', async () => {
    const Things = repo.get('Thing');
    const t = await Things.create({ name: 'C', count: 3 });

    // change a value but do not flush
    t.name = 'C2';
    expect(t._isDirty).toBe(true);
    // sync with new DB payload should clear changes and set data
    t.sync({ name: 'C3' });
    expect(t._isDirty).toBe(false);
    expect(t.name).toBe('C3');

    const json = t.toJSON();
    expect(json.name).toBe('C3');
    expect(json.count).toBe(3);

    t.unlink();
    expect(t._model).toBeNull();
  });

  test('ready() calls model.lookup when _isReady is false', async () => {
    const Things = repo.get('Thing');
    const t = await Things.create({ name: 'D', count: 4 });
    // simulate pending state
    t._isReady = false;
    const spy = jest.spyOn(Things, 'lookup').mockResolvedValue([t]);
    const out = await t.ready();
    expect(spy).toHaveBeenCalledWith(t.id);
    expect(out).toBe(t);
    spy.mockRestore();
  });
});

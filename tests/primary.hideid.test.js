'use strict';

const { Connection, Repository } = require('..');
const { Field } = require('../src/Fields');

/**
 * Custom Primary field that hides its value from JSON output by returning undefined.
 */
class HiddenPrimary extends Field.behaviors.primary {
  toJSON(_record) {
    // Intentionally hide the id value when serializing
    return undefined;
  }
}

describe('HiddenPrimary toJSON()', () => {
  let conn, repo, Users;

  beforeAll(async () => {
    conn = new Connection({ client: 'sqlite3', connection: { filename: ':memory:' } });
    await conn.connect();
    repo = new Repository(conn);
    class UsersBase {
      static name = 'UsersHiddenId';
      static table = 'users_hidden_id';
      static fields = {
        id: { type: 'primary' },
        email: { type: 'string', required: true },
      };
    }
    // Register and initialize model so fields are materialized
    repo.register(UsersBase);
    Users = repo.get('UsersHiddenId');
    Users._init();
    // Replace the primary field with our HiddenPrimary instance retaining definition
    const original = Users.fields.id; // Field instance
    Users.fields.id = new HiddenPrimary(Users, 'id', original.definition);
    Users.primaryField = Users.fields.id;
    // Re-attach property accessors on prototype to ensure getter uses new field
    Users.fields.id.attach(Users, Users.cls);
    await repo.sync({ force: true });
  });

  afterAll(async () => {
    await conn.destroy();
  });

  test('record JSON hides id but internal id works', async () => {
    const u = await Users.create({ email: 'test@example.com' });
    expect(u.id).toBeGreaterThan(0); // internal id assigned
    const raw = u.toRawJSON();
    // Hidden: id should not appear OR should be undefined when present
    expect(Object.prototype.hasOwnProperty.call(raw, 'id')).toBe(false);
    expect(raw.id).toBeUndefined();
    const json = JSON.parse(JSON.stringify(u));
    expect(json.id).toBeUndefined();
    // Lookup by id still works
    const fetched = await Users.findById(u.id);
    expect(fetched).toBeTruthy();
    expect(fetched.email).toBe('test@example.com');
  });
});

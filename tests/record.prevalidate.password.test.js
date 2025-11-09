'use strict';

const { Connection, Repository } = require('..');
const crypto = require('node:crypto');

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

describe('record pre_validate hashes password', () => {
  let conn, repo, Users;

  beforeAll(async () => {
    conn = new Connection({ client: 'sqlite3', connection: { filename: ':memory:' } });
    await conn.connect();
    repo = new Repository(conn);

    class UsersBase {
      static _name = 'UsersPassword';
      static table = 'users_passwords';
      static fields = {
        id: 'primary',
        email: { type: 'string', required: true },
        // Allow writing password so isChanged('password') works; we'll null it before persisting
        password: { type: 'string' },
        password_hash: { type: 'string', required: true },
      };
      async pre_validate() {
        if (this.isChanged('password')) {
          const p = this.password;
          if (p) {
            this.password_hash = sha256(p);
            // Clear plaintext before insert/update to avoid storing it
            this.password = null;
          }
        }
        return this;
      }
    }

    repo.register(UsersBase);
    Users = repo.get('UsersPassword');
    await repo.sync({ force: true });
  });

  afterAll(async () => {
    await conn.destroy();
  });

  test('hashes on create and updates only when password changes', async () => {
    const u = await Users.create({ email: 'a@example.com', password: 'secret1' });
    const expected1 = sha256('secret1');
    expect(u.password_hash).toBe(expected1);

    // Update unrelated field -> hash unchanged
    u.email = 'b@example.com';
    await u.flush();
    expect(u.password_hash).toBe(expected1);

    // Change password -> hash updates
    u.password = 'secret2';
    await u.flush();
    const expected2 = sha256('secret2');
    expect(u.password_hash).toBe(expected2);

    // Persisted value check
    const refetched = await Users.findById(u.id);
    expect(refetched.password_hash).toBe(expected2);
  });
});

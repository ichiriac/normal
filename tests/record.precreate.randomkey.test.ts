// @ts-nocheck - Test file with implicit any types

import { Connection, Repository } from '..';
import crypto from 'node:crypto';

/**
 * Model that generates a random api_key in the record pre_create hook
 */
describe('record pre_create generates random key', () => {
  let conn, repo, ApiClients;

  beforeAll(async () => {
    conn = new Connection({ client: 'sqlite3', connection: { filename: ':memory:' } });
    await conn.connect();
    repo = new Repository(conn);

    class ApiClientsBase {
      static name = 'ApiClients';
      static table = 'api_clients';
      static fields = {
        id: 'primary',
        name: { type: 'string', required: true },
        api_key: { type: 'string', required: true, unique: true, index: true },
      };
      // Use the active record hook to auto-generate an API key when missing
      async pre_create() {
        if (!this.api_key) {
          // 16 bytes -> 32 hex chars
          this.api_key = crypto.randomBytes(16).toString('hex');
        }
        return this;
      }
    }

    repo.register(ApiClientsBase);
    ApiClients = repo.get('ApiClients');
    await repo.sync({ force: true });
  });

  afterAll(async () => {
    await conn.destroy();
  });

  test('auto-generates api_key when not provided', async () => {
    const c = await ApiClients.create({ name: 'svc-A' });
    expect(c.id).toBeGreaterThan(0);
    expect(typeof c.api_key).toBe('string');
    expect(c.api_key).toHaveLength(32);
    // Ensure persisted in DB and cache-consistent via reload
    const again = await ApiClients.findById(c.id);
    expect(again.api_key).toBe(c.api_key);
  });

  test('does not overwrite provided api_key', async () => {
    const provided = crypto.randomBytes(16).toString('hex');
    const c = await ApiClients.create({ name: 'svc-B', api_key: provided });
    expect(c.api_key).toBe(provided);
    const fetched = await ApiClients.findById(c.id);
    expect(fetched.api_key).toBe(provided);
  });
});

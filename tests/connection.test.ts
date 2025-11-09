// @ts-nocheck - Test file with implicit any types

import { Connection } from '..';

describe('Connection config building', () => {
  test('defaults to pg config when no opts provided', () => {
    const c = new Connection();
    expect(c.config.client).toBe('pg');
    expect(c.config.connection).toMatchObject({
      host: expect.any(String),
      port: expect.any(Number),
    });
  });

  test('sqlite3 config uses filename and null defaults', () => {
    const c = new Connection({ client: 'sqlite3', connection: { filename: ':memory:' } });
    expect(c.config.client).toBe('sqlite3');
    expect(c.config.connection).toMatchObject({ filename: ':memory:' });
    expect(c.config.useNullAsDefault).toBe(true);
  });

  test('fallback client passes through opts', () => {
    const c = new Connection({
      client: 'mysql2',
      connection: { host: 'localhost' },
      pool: { min: 0, max: 2 },
    });
    expect(c.config.client).toBe('mysql2');
    expect(c.config.connection).toEqual({ host: 'localhost' });
    expect(c.config.pool).toEqual({ min: 0, max: 2 });
  });
});

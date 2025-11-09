// @ts-nocheck - Test file with implicit any types


import { Connection  } from '../src/Connection';
import fs from 'fs';
import path from 'path';

describe('Connection with Discovery', () => {
  test('getConnectionHash returns consistent hash', () => {
    const conn = new Connection({
      client: 'sqlite3',
      connection: { filename: ':memory:' },
    });

    const hash1 = conn.getConnectionHash();
    const hash2 = conn.getConnectionHash();

    expect(hash1).toBe(hash2);
    expect(typeof hash1).toBe('string');
    expect(hash1).toHaveLength(8);
  });

  test('getConnectionHash differs for different configs', () => {
    const conn1 = new Connection({
      client: 'sqlite3',
      connection: { filename: ':memory:' },
    });

    const conn2 = new Connection({
      client: 'pg',
      connection: { host: 'localhost', database: 'test' },
    });

    const hash1 = conn1.getConnectionHash();
    const hash2 = conn2.getConnectionHash();

    expect(hash1).not.toBe(hash2);
  });

  test('getDiscovery creates discovery instance', () => {
    const conn = new Connection({
      client: 'sqlite3',
      connection: { filename: ':memory:' },
      discovery: { enabled: false },
    });

    const discovery = conn.getDiscovery();

    expect(discovery).toBeTruthy();
    expect(discovery.enabled).toBe(false);
    expect(discovery.packageName).toBeTruthy();
    expect(discovery.packageVersion).toBeTruthy();
    expect(discovery.secret).toBeTruthy();
  });

  test('getDiscovery uses connection config as secret', () => {
    const conn = new Connection({
      client: 'sqlite3',
      connection: { filename: ':memory:' },
      discovery: { enabled: false },
    });

    const discovery = conn.getDiscovery();
    const secret = discovery.secret;

    expect(secret).toBeTruthy();
    expect(typeof secret).toBe('string');
    expect(secret.length).toBe(64); // SHA256 hex = 64 chars
  });

  test('getDiscovery includes connection hash', () => {
    const conn = new Connection({
      client: 'sqlite3',
      connection: { filename: ':memory:' },
      discovery: { enabled: false },
    });

    const discovery = conn.getDiscovery();
    const connHash = conn.getConnectionHash();

    expect(discovery.connectionHash).toBe(connHash);
  });

  test('getDiscovery respects custom discovery options', () => {
    const conn = new Connection({
      client: 'sqlite3',
      connection: { filename: ':memory:' },
      discovery: {
        enabled: false,
        packageName: 'custom-app',
        packageVersion: '2.0.0',
        discoveryPort: 12345,
      },
    });

    const discovery = conn.getDiscovery();

    expect(discovery.packageName).toBe('custom-app');
    expect(discovery.packageVersion).toBe('2.0.0');
    expect(discovery.discoveryPort).toBe(12345);
  });

  test('startDiscovery does not start when disabled', async () => {
    const conn = new Connection({
      client: 'sqlite3',
      connection: { filename: ':memory:' },
      discovery: { enabled: false },
    });

    await conn.startDiscovery();
    const discovery = conn.getDiscovery();

    expect(discovery.started).toBe(false);
  });

  test('destroy stops discovery', async () => {
    const conn = new Connection({
      client: 'sqlite3',
      connection: { filename: ':memory:' },
      discovery: { enabled: false },
    });

    conn.getDiscovery(); // Create the discovery instance
    await conn.destroy();

    // Discovery should be cleaned up
    expect(conn._discovery).toBeNull();
  });

  test('getDiscovery reads parent package.json', () => {
    // Save current directory
    const originalCwd = process.cwd();

    try {
      // Create a temporary package.json
      const tempDir = path.join(__dirname, '..', 'temp-test-pkg');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const pkgPath = path.join(tempDir, 'package.json');
      fs.writeFileSync(
        pkgPath,
        JSON.stringify({
          name: 'test-app',
          version: '3.5.7',
        })
      );

      // Change to temp directory
      process.chdir(tempDir);

      const conn = new Connection({
        client: 'sqlite3',
        connection: { filename: ':memory:' },
        discovery: { enabled: false },
      });

      const discovery = conn.getDiscovery();

      expect(discovery.packageName).toBe('test-app');
      expect(discovery.packageVersion).toBe('3.5.7');

      // Cleanup
      fs.unlinkSync(pkgPath);
      fs.rmdirSync(tempDir);
    } finally {
      // Restore directory
      process.chdir(originalCwd);
    }
  });

  test('getDiscovery falls back to normaljs when no parent package found', () => {
    // This test runs in normaljs repo itself, so it should use normaljs
    const conn = new Connection({
      client: 'sqlite3',
      connection: { filename: ':memory:' },
      discovery: { enabled: false },
    });

    const discovery = conn.getDiscovery();

    // Should fallback to normaljs since we're in the normaljs package
    expect(discovery.packageName).toBe('normaljs');
  });
});

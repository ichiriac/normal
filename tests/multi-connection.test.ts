// @ts-nocheck - Test file with implicit any types

import { Connection } from '../src/Connection';
import { Repository } from '../src/Repository';

describe('Multi-connection with Discovery and Cache', () => {
  let conn1, conn2, repo1, repo2;

  afterEach(async () => {
    if (conn1) await conn1.destroy();
    if (conn2) await conn2.destroy();
  });

  test('Two connections with different databases have separate cache and discovery instances', () => {
    // Create two connections with different SQLite files
    conn1 = new Connection({
      client: 'sqlite3',
      connection: { filename: 'first.sqlite' },
      discovery: { enabled: false },
      cache: { enabled: true, maxEntries: 1024 },
    });

    conn2 = new Connection({
      client: 'sqlite3',
      connection: { filename: 'second.sqlite' },
      discovery: { enabled: false },
      cache: { enabled: true, maxEntries: 2048 },
    });

    // Get cache instances
    const cache1 = conn1.getCache();
    const cache2 = conn2.getCache();

    // Verify we have two separate cache instances
    expect(cache1).not.toBeNull();
    expect(cache2).not.toBeNull();
    expect(cache1).not.toBe(cache2);
    expect(cache1.maxEntries).toBe(1024);
    expect(cache2.maxEntries).toBe(2048);

    // Get discovery instances
    const discovery1 = conn1.getDiscovery();
    const discovery2 = conn2.getDiscovery();

    // Verify we have two separate discovery instances
    expect(discovery1).not.toBeNull();
    expect(discovery2).not.toBeNull();
    expect(discovery1).not.toBe(discovery2);

    // Verify different connection hashes (different encryption keys)
    const hash1 = conn1.getConnectionHash();
    const hash2 = conn2.getConnectionHash();
    expect(hash1).not.toBe(hash2);

    // Verify discovery instances have different secrets
    expect(discovery1.secret).not.toBe(discovery2.secret);
    expect(discovery1.connectionHash).toBe(hash1);
    expect(discovery2.connectionHash).toBe(hash2);
  });

  test('Two repositories with different connections have separate caches', () => {
    conn1 = new Connection({
      client: 'sqlite3',
      connection: { filename: ':memory:' },
      cache: { enabled: true, maxEntries: 512 },
    });

    conn2 = new Connection({
      client: 'sqlite3',
      connection: { filename: ':memory:' },
      cache: { enabled: true, maxEntries: 1024 },
    });

    repo1 = new Repository(conn1);
    repo2 = new Repository(conn2);

    // Verify repositories have different cache instances
    const cache1 = repo1.cache;
    const cache2 = repo2.cache;

    expect(cache1).not.toBeNull();
    expect(cache2).not.toBeNull();
    expect(cache1).not.toBe(cache2);
    expect(cache1.maxEntries).toBe(512);
    expect(cache2.maxEntries).toBe(1024);
  });

  test('Cache-Discovery integration: discovered members become cache peers', async () => {
    conn1 = new Connection({
      client: 'sqlite3',
      connection: { filename: 'db1.sqlite' },
      discovery: {
        enabled: false, // We'll test this without actually starting discovery
        packageName: 'test-app',
        packageVersion: '1.0.0',
      },
      cache: { enabled: true },
    });

    const discovery = conn1.getDiscovery();
    const cache = conn1.getCache();

    // Simulate a member joining with same connection hash
    const memberData = {
      type: 'announce',
      package: 'test-app',
      version: '1.0.0',
      node_id: 'node-remote',
      addr: '192.168.1.100',
      port: 8000,
      discovery_port: 56789,
      timestamp: Date.now(),
      ttl: 30000,
      nonce: 'nonce123',
      connections: [conn1.getConnectionHash()], // Same connection hash
      metadata: {},
    };

    // Manually add member (bypassing message verification for test)
    discovery.members.set(memberData.node_id, {
      nodeId: memberData.node_id,
      addr: memberData.addr,
      port: memberData.port,
      discoveryPort: memberData.discovery_port,
      package: memberData.package,
      version: memberData.version,
      lastSeen: Date.now(),
      ttl: memberData.ttl,
      metadata: memberData.metadata,
      connections: memberData.connections,
    });

    // Trigger sync
    conn1._syncCachePeersFromDiscovery();

    // Verify the member was added to cache peers
    expect(cache.clusterPeers).toHaveLength(1);
    expect(cache.clusterPeers[0].host).toBe('192.168.1.100');
    expect(cache.clusterPeers[0].port).toBe(8000);
  });

  test('Cache-Discovery integration: only members with matching connection hash are used', async () => {
    conn1 = new Connection({
      client: 'sqlite3',
      connection: { filename: 'db1.sqlite' },
      discovery: {
        enabled: false,
        packageName: 'test-app',
        packageVersion: '1.0.0',
      },
      cache: { enabled: true },
    });

    const discovery = conn1.getDiscovery();
    const cache = conn1.getCache();

    // Add member with matching connection hash
    discovery.members.set('node-1', {
      nodeId: 'node-1',
      addr: '192.168.1.100',
      port: 8000,
      discoveryPort: 56789,
      package: 'test-app',
      version: '1.0.0',
      lastSeen: Date.now(),
      ttl: 30000,
      metadata: {},
      connections: [conn1.getConnectionHash()],
    });

    // Add member with different connection hash (different database)
    discovery.members.set('node-2', {
      nodeId: 'node-2',
      addr: '192.168.1.101',
      port: 8001,
      discoveryPort: 56789,
      package: 'test-app',
      version: '1.0.0',
      lastSeen: Date.now(),
      ttl: 30000,
      metadata: {},
      connections: ['different-hash'],
    });

    // Trigger sync
    conn1._syncCachePeersFromDiscovery();

    // Only the member with matching connection hash should be added
    expect(cache.clusterPeers).toHaveLength(1);
    expect(cache.clusterPeers[0].host).toBe('192.168.1.100');
    expect(cache.clusterPeers[0].port).toBe(8000);
  });

  test('Two connections with different databases discover only their respective peers', () => {
    conn1 = new Connection({
      client: 'sqlite3',
      connection: { filename: 'db1.sqlite' },
      discovery: {
        enabled: false,
        packageName: 'test-app',
        packageVersion: '1.0.0',
      },
      cache: { enabled: true },
    });

    conn2 = new Connection({
      client: 'sqlite3',
      connection: { filename: 'db2.sqlite' },
      discovery: {
        enabled: false,
        packageName: 'test-app',
        packageVersion: '1.0.0',
      },
      cache: { enabled: true },
    });

    const discovery1 = conn1.getDiscovery();
    const discovery2 = conn2.getDiscovery();
    const cache1 = conn1.getCache();
    const cache2 = conn2.getCache();

    const hash1 = conn1.getConnectionHash();
    const hash2 = conn2.getConnectionHash();

    // Different databases should have different hashes
    expect(hash1).not.toBe(hash2);

    // Add members to discovery1
    discovery1.members.set('node-1a', {
      nodeId: 'node-1a',
      addr: '192.168.1.10',
      port: 8000,
      discoveryPort: 56789,
      package: 'test-app',
      version: '1.0.0',
      lastSeen: Date.now(),
      ttl: 30000,
      metadata: {},
      connections: [hash1],
    });

    discovery1.members.set('node-1b', {
      nodeId: 'node-1b',
      addr: '192.168.1.11',
      port: 8001,
      discoveryPort: 56789,
      package: 'test-app',
      version: '1.0.0',
      lastSeen: Date.now(),
      ttl: 30000,
      metadata: {},
      connections: [hash1],
    });

    // Add members to discovery2
    discovery2.members.set('node-2a', {
      nodeId: 'node-2a',
      addr: '192.168.1.20',
      port: 9000,
      discoveryPort: 56789,
      package: 'test-app',
      version: '1.0.0',
      lastSeen: Date.now(),
      ttl: 30000,
      metadata: {},
      connections: [hash2],
    });

    discovery2.members.set('node-2b', {
      nodeId: 'node-2b',
      addr: '192.168.1.21',
      port: 9001,
      discoveryPort: 56789,
      package: 'test-app',
      version: '1.0.0',
      lastSeen: Date.now(),
      ttl: 30000,
      metadata: {},
      connections: [hash2],
    });

    // Sync both
    conn1._syncCachePeersFromDiscovery();
    conn2._syncCachePeersFromDiscovery();

    // Each connection should only have its own peers
    expect(cache1.clusterPeers).toHaveLength(2);
    expect(cache1.clusterPeers[0].host).toBe('192.168.1.10');
    expect(cache1.clusterPeers[1].host).toBe('192.168.1.11');

    expect(cache2.clusterPeers).toHaveLength(2);
    expect(cache2.clusterPeers[0].host).toBe('192.168.1.20');
    expect(cache2.clusterPeers[1].host).toBe('192.168.1.21');
  });
});

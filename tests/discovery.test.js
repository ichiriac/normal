'use strict';

const { Discovery, hashString, isVersionCompatible } = require('../src/cache/Discovery');

describe('Discovery utility functions', () => {
  test('hashString produces consistent 8-char hashes', () => {
    const hash1 = hashString('test');
    const hash2 = hashString('test');
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(8);
    expect(hashString('different')).not.toBe(hash1);
  });

  test('isVersionCompatible checks major.minor by default', () => {
    expect(isVersionCompatible('1.2.3', '1.2.4', ['major', 'minor'])).toBe(true);
    expect(isVersionCompatible('1.2.3', '1.3.0', ['major', 'minor'])).toBe(false);
    expect(isVersionCompatible('1.2.3', '2.0.0', ['major', 'minor'])).toBe(false);
  });

  test('isVersionCompatible handles major-only policy', () => {
    expect(isVersionCompatible('1.2.3', '1.9.9', ['major'])).toBe(true);
    expect(isVersionCompatible('1.2.3', '2.0.0', ['major'])).toBe(false);
  });

  test('isVersionCompatible handles exact match policy', () => {
    expect(isVersionCompatible('1.2.3', '1.2.3', ['major', 'minor', 'patch'])).toBe(true);
    expect(isVersionCompatible('1.2.3', '1.2.4', ['major', 'minor', 'patch'])).toBe(false);
  });

  test('isVersionCompatible handles missing versions', () => {
    expect(isVersionCompatible(null, '1.0.0')).toBe(false);
    expect(isVersionCompatible('1.0.0', null)).toBe(false);
    expect(isVersionCompatible(null, null)).toBe(false);
  });
});

describe('Discovery message signing and verification', () => {
  test('sign and verify message with HMAC', () => {
    const discovery = new Discovery({
      enabled: false,
      secret: 'test-secret',
      packageName: 'test-app',
      packageVersion: '1.0.0',
    });

    const message = {
      type: 'announce',
      package: 'test-app',
      version: '1.0.0',
      node_id: 'node-1',
      addr: '192.168.1.100',
      port: 8000,
      discovery_port: 56789,
      timestamp: Date.now(),
      ttl: 30000,
      nonce: 'abc123',
      connections: [],
      metadata: {},
    };

    const signature = discovery._signMessage(message);
    expect(signature).toBeTruthy();
    expect(typeof signature).toBe('string');

    message.signature = signature;
    expect(discovery._verifyMessage(message)).toBe(true);

    // Tamper with message
    message.port = 9000;
    expect(discovery._verifyMessage(message)).toBe(false);
  });

  test('reject message without signature', () => {
    const discovery = new Discovery({
      enabled: false,
      secret: 'test-secret',
    });

    const message = {
      type: 'announce',
      package: 'test-app',
      version: '1.0.0',
      node_id: 'node-1',
      timestamp: Date.now(),
    };

    expect(discovery._verifyMessage(message)).toBe(false);
  });

  test('reject message with wrong secret', () => {
    const discovery1 = new Discovery({
      enabled: false,
      secret: 'secret-1',
    });

    const discovery2 = new Discovery({
      enabled: false,
      secret: 'secret-2',
    });

    const message = {
      type: 'announce',
      package: 'test-app',
      version: '1.0.0',
      node_id: 'node-1',
      timestamp: Date.now(),
    };

    const signature = discovery1._signMessage(message);
    message.signature = signature;

    expect(discovery2._verifyMessage(message)).toBe(false);
  });
});

describe('Discovery replay protection', () => {
  test('accept message with valid timestamp and fresh nonce', () => {
    const discovery = new Discovery({
      enabled: false,
      secret: 'test-secret',
    });

    const message = {
      node_id: 'node-1',
      timestamp: Date.now(),
      nonce: 'abc123',
    };

    expect(discovery._checkReplay(message)).toBe(true);
  });

  test('reject message with duplicate nonce', () => {
    const discovery = new Discovery({
      enabled: false,
      secret: 'test-secret',
    });

    const message = {
      node_id: 'node-1',
      timestamp: Date.now(),
      nonce: 'abc123',
    };

    expect(discovery._checkReplay(message)).toBe(true);
    expect(discovery._checkReplay(message)).toBe(false);
  });

  test('reject message with timestamp outside tolerance', () => {
    const discovery = new Discovery({
      enabled: false,
      secret: 'test-secret',
      clockSkewToleranceMs: 5000,
    });

    const now = Date.now();
    const oldMessage = {
      node_id: 'node-1',
      timestamp: now - 10000, // 10 seconds ago (well outside 5s tolerance)
      nonce: 'old123',
    };

    const futureMessage = {
      node_id: 'node-2',
      timestamp: now + 10000, // 10 seconds in future (well outside 5s tolerance)
      nonce: 'future123',
    };

    expect(discovery._checkReplay(oldMessage)).toBe(false);
    expect(discovery._checkReplay(futureMessage)).toBe(false);
  });

  test('nonce cache respects max size', () => {
    const discovery = new Discovery({
      enabled: false,
      secret: 'test-secret',
    });

    discovery.nonceCacheMaxSize = 5;

    for (let i = 0; i < 10; i++) {
      const message = {
        node_id: 'node-1',
        timestamp: Date.now(),
        nonce: `nonce-${i}`,
      };
      discovery._checkReplay(message);
    }

    expect(discovery.nonceCache.size).toBeLessThanOrEqual(5);
  });
});

describe('Discovery membership management', () => {
  test('handle announce from new member', async () => {
    const discovery = new Discovery({
      enabled: false,
      secret: 'test-secret',
      packageName: 'test-app',
      packageVersion: '1.0.0',
    });

    const announceData = {
      type: 'announce',
      package: 'test-app',
      version: '1.0.0',
      node_id: 'node-2',
      addr: '192.168.1.101',
      port: 8001,
      discovery_port: 56789,
      timestamp: Date.now(),
      ttl: 30000,
      nonce: 'xyz789',
      connections: ['conn1'],
      metadata: { role: 'cache' },
    };

    discovery._handleAnnounce(announceData);

    expect(discovery.members.size).toBe(1);
    const member = discovery.members.get('node-2');
    expect(member).toBeTruthy();
    expect(member.addr).toBe('192.168.1.101');
    expect(member.port).toBe(8001);
    expect(member.metadata.role).toBe('cache');
  });

  test('handle announce updates existing member', () => {
    const discovery = new Discovery({
      enabled: false,
      secret: 'test-secret',
      packageName: 'test-app',
      packageVersion: '1.0.0',
    });

    const announceData1 = {
      type: 'announce',
      package: 'test-app',
      version: '1.0.0',
      node_id: 'node-2',
      addr: '192.168.1.101',
      port: 8001,
      discovery_port: 56789,
      timestamp: Date.now(),
      ttl: 30000,
      nonce: 'nonce1',
      connections: [],
      metadata: {},
    };

    discovery._handleAnnounce(announceData1);
    const firstSeen = discovery.members.get('node-2').lastSeen;

    // Update with same node
    const announceData2 = {
      ...announceData1,
      timestamp: Date.now() + 1000,
      nonce: 'nonce2',
    };

    discovery._handleAnnounce(announceData2);

    expect(discovery.members.size).toBe(1);
    const member = discovery.members.get('node-2');
    expect(member.lastSeen).toBeGreaterThanOrEqual(firstSeen);
  });

  test('evict stale members', async () => {
    const discovery = new Discovery({
      enabled: false,
      secret: 'test-secret',
      packageName: 'test-app',
      packageVersion: '1.0.0',
    });

    const announceData = {
      type: 'announce',
      package: 'test-app',
      version: '1.0.0',
      node_id: 'node-stale',
      addr: '192.168.1.102',
      port: 8002,
      discovery_port: 56789,
      timestamp: Date.now(),
      ttl: 100, // Very short TTL
      nonce: 'stale123',
      connections: [],
      metadata: {},
    };

    discovery._handleAnnounce(announceData);
    expect(discovery.members.size).toBe(1);

    // Wait for eviction (TTL * 1.5 = 150ms)
    await new Promise((resolve) => setTimeout(resolve, 200));
    discovery._evictStaleMembers();
    expect(discovery.members.size).toBe(0);
  });

  test('getMembers returns array of members', () => {
    const discovery = new Discovery({
      enabled: false,
      secret: 'test-secret',
      packageName: 'test-app',
      packageVersion: '1.0.0',
    });

    discovery._handleAnnounce({
      type: 'announce',
      package: 'test-app',
      version: '1.0.0',
      node_id: 'node-1',
      addr: '192.168.1.100',
      port: 8000,
      discovery_port: 56789,
      timestamp: Date.now(),
      ttl: 30000,
      nonce: 'n1',
      connections: [],
      metadata: {},
    });

    discovery._handleAnnounce({
      type: 'announce',
      package: 'test-app',
      version: '1.0.0',
      node_id: 'node-2',
      addr: '192.168.1.101',
      port: 8001,
      discovery_port: 56789,
      timestamp: Date.now(),
      ttl: 30000,
      nonce: 'n2',
      connections: [],
      metadata: {},
    });

    const members = discovery.getMembers();
    expect(Array.isArray(members)).toBe(true);
    expect(members.length).toBe(2);
  });
});

describe('Discovery event handlers', () => {
  test('onMemberJoin called for new members', () => {
    const joinHandler = jest.fn();
    const discovery = new Discovery({
      enabled: false,
      secret: 'test-secret',
      packageName: 'test-app',
      packageVersion: '1.0.0',
      onMemberJoin: joinHandler,
    });

    const announceData = {
      type: 'announce',
      package: 'test-app',
      version: '1.0.0',
      node_id: 'node-new',
      addr: '192.168.1.103',
      port: 8003,
      discovery_port: 56789,
      timestamp: Date.now(),
      ttl: 30000,
      nonce: 'new123',
      connections: [],
      metadata: {},
    };

    discovery._handleAnnounce(announceData);

    expect(joinHandler).toHaveBeenCalledTimes(1);
    expect(joinHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: 'node-new',
        addr: '192.168.1.103',
        port: 8003,
      })
    );
  });

  test('onMemberUpdate called for existing members', () => {
    const updateHandler = jest.fn();
    const discovery = new Discovery({
      enabled: false,
      secret: 'test-secret',
      packageName: 'test-app',
      packageVersion: '1.0.0',
      onMemberUpdate: updateHandler,
    });

    const announceData = {
      type: 'announce',
      package: 'test-app',
      version: '1.0.0',
      node_id: 'node-update',
      addr: '192.168.1.104',
      port: 8004,
      discovery_port: 56789,
      timestamp: Date.now(),
      ttl: 30000,
      nonce: 'nonce1',
      connections: [],
      metadata: {},
    };

    discovery._handleAnnounce(announceData);
    expect(updateHandler).not.toHaveBeenCalled();

    // Send update
    const updateData = {
      ...announceData,
      timestamp: Date.now() + 1000,
      nonce: 'nonce2',
    };

    discovery._handleAnnounce(updateData);
    expect(updateHandler).toHaveBeenCalledTimes(1);
  });

  test('onMemberLeave called for evicted members', async () => {
    const leaveHandler = jest.fn();
    const discovery = new Discovery({
      enabled: false,
      secret: 'test-secret',
      packageName: 'test-app',
      packageVersion: '1.0.0',
      onMemberLeave: leaveHandler,
    });

    discovery._handleAnnounce({
      type: 'announce',
      package: 'test-app',
      version: '1.0.0',
      node_id: 'node-leave',
      addr: '192.168.1.105',
      port: 8005,
      discovery_port: 56789,
      timestamp: Date.now(),
      ttl: 100,
      nonce: 'leave123',
      connections: [],
      metadata: {},
    });

    await new Promise((resolve) => setTimeout(resolve, 200));
    discovery._evictStaleMembers();
    expect(leaveHandler).toHaveBeenCalledTimes(1);
    expect(leaveHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: 'node-leave',
      })
    );
  });
});

describe('Discovery disabled state', () => {
  test('disabled discovery does not start', async () => {
    const discovery = new Discovery({ enabled: false });
    await discovery.start();
    expect(discovery.started).toBe(false);
    expect(discovery.socket).toBeNull();
  });

  test('stop does nothing when disabled', () => {
    const discovery = new Discovery({ enabled: false });
    expect(() => discovery.stop()).not.toThrow();
  });
});

'use strict';

const dgram = require('dgram');
const crypto = require('crypto');
const os = require('os');

/**
 * UDP-based local discovery protocol for cache cluster membership.
 *
 * Features:
 * - Automatic node discovery on local networks (L2)
 * - Package name and version scoping
 * - Soft-state membership with keep-alive and TTL
 * - HMAC-SHA256 message authentication
 * - Replay protection (timestamp + nonce)
 * - Fault tolerance with retransmission
 * - Multicast with broadcast fallback
 */

/**
 * @typedef {Object} DiscoveryOptions
 * @property {boolean} [enabled=false] - Enable discovery
 * @property {string} [multicastGroup='239.255.1.1'] - Multicast IP address
 * @property {number} [discoveryPort=56789] - UDP port for discovery messages
 * @property {number} [cachePort=1983] - Cache service port to announce
 * @property {string} [nodeId] - Unique node identifier (auto-generated if not provided)
 * @property {string} [packageName] - Application package name
 * @property {string} [packageVersion] - Application package version
 * @property {string} [secret] - Shared secret for HMAC (derived from connection config)
 * @property {number} [ttl=30000] - Member TTL in milliseconds
 * @property {number} [announceIntervalMs=10000] - Keep-alive interval
 * @property {number} [bootstrapRetries=10] - Number of bootstrap announcements
 * @property {number} [bootstrapIntervalMs=1000] - Bootstrap announcement interval
 * @property {string[]} [versionPolicy=['major','minor']] - Version compatibility policy
 * @property {string[]} [fallbackSeeds] - Static seed nodes (host:port)
 * @property {boolean} [allowBroadcast=true] - Allow broadcast fallback
 * @property {Function} [onMemberJoin] - Callback for member join events
 * @property {Function} [onMemberUpdate] - Callback for member update events
 * @property {Function} [onMemberLeave] - Callback for member leave events
 * @property {Function} [onError] - Callback for discovery errors
 */

/**
 * @typedef {Object} MemberInfo
 * @property {string} nodeId - Unique node identifier
 * @property {string} addr - IP address
 * @property {number} port - Cache service port
 * @property {number} discoveryPort - Discovery port
 * @property {string} package - Package name
 * @property {string} version - Package version
 * @property {number} lastSeen - Timestamp of last announcement
 * @property {number} ttl - Time-to-live in milliseconds
 * @property {Object} [metadata] - Additional metadata
 * @property {string[]} [connections] - Connection hashes
 */

/**
 * Generate a random node ID
 */
function generateNodeId() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Generate a random nonce (6 characters)
 */
function generateNonce() {
  return crypto.randomBytes(4).toString('base64').substring(0, 6);
}

/**
 * Hash a string with SHA256
 */
function hashString(str) {
  return crypto.createHash('sha256').update(str).digest('hex').substring(0, 8);
}

/**
 * Check if two versions are compatible according to the policy
 */
function isVersionCompatible(v1, v2, policy = ['major', 'minor']) {
  if (!v1 || !v2) return false;
  const p1 = v1.split('.').map((x) => parseInt(x, 10) || 0);
  const p2 = v2.split('.').map((x) => parseInt(x, 10) || 0);

  for (let i = 0; i < policy.length; i++) {
    if (policy[i] === 'major' && i === 0) {
      if (p1[0] !== p2[0]) return false;
    } else if (policy[i] === 'minor' && i === 1) {
      if (p1[1] !== p2[1]) return false;
    } else if (policy[i] === 'patch' && i === 2) {
      if (p1[2] !== p2[2]) return false;
    }
  }
  return true;
}

/**
 * Get local IP addresses (IPv4 only)
 */
function getLocalAddresses() {
  const addresses = [];
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

class Discovery {
  /**
   * @param {DiscoveryOptions} options
   */
  constructor(options = {}) {
    this.enabled = options.enabled !== false;

    // Configuration
    this.multicastGroup = options.multicastGroup || '239.255.1.1';
    this.discoveryPort = options.discoveryPort || 56789;
    this.cachePort = options.cachePort || 1983;
    this.nodeId = options.nodeId || generateNodeId();
    this.packageName = options.packageName || 'normaljs';
    this.packageVersion = options.packageVersion || '1.0.0';
    this.secret = options.secret || '';
    this.ttl = options.ttl || 30000; // 30 seconds
    this.announceIntervalMs = options.announceIntervalMs || 10000; // 10 seconds
    this.bootstrapRetries = options.bootstrapRetries || 10;
    this.bootstrapIntervalMs = options.bootstrapIntervalMs || 1000; // 1 second
    this.versionPolicy = options.versionPolicy || ['major', 'minor'];
    this.fallbackSeeds = options.fallbackSeeds || [];
    this.allowBroadcast = options.allowBroadcast !== false;
    this.connectionHashes = options.connectionHashes || [];

    // Event handlers
    this.onMemberJoin = options.onMemberJoin;
    this.onMemberUpdate = options.onMemberUpdate;
    this.onMemberLeave = options.onMemberLeave;
    this.onError = options.onError;

    // State
    /** @type {Map<string, MemberInfo>} */
    this.members = new Map();
    this.nonceCache = new Set(); // For replay protection
    this.nonceCacheMaxSize = options.nonceCacheMaxSize || 1000;
    this.clockSkewToleranceMs = options.clockSkewToleranceMs || 30000; // 30 seconds

    // Network
    this.socket = null;
    this.announceTimer = null;
    this.evictionTimer = null;
    this.bootstrapCount = 0;
    this.localAddresses = getLocalAddresses();
    this.started = false;
  }

  /**
   * Start the discovery service
   */
  async start() {
    if (!this.enabled || this.started) return;

    try {
      this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      // Handle incoming messages
      this.socket.on('message', (msg, rinfo) => {
        this._handleMessage(msg, rinfo);
      });

      this.socket.on('error', (err) => {
        if (this.onError) {
          this.onError(err);
        } else if (process.env.NORMAL_DISCOVERY_DEBUG) {
          // eslint-disable-next-line no-console
          console.warn('[Discovery] Socket error:', err.message);
        }
      });

      // Bind to discovery port
      await new Promise((resolve, reject) => {
        this.socket.bind(this.discoveryPort, () => {
          try {
            // Join multicast group
            this.socket.addMembership(this.multicastGroup);
            this.socket.setMulticastTTL(128);
            this.socket.setMulticastLoopback(true);

            if (process.env.NORMAL_DISCOVERY_DEBUG) {
              // eslint-disable-next-line no-console
              console.log(
                `[Discovery] Listening on port ${this.discoveryPort}, multicast ${this.multicastGroup}`
              );
            }
            resolve();
          } catch (err) {
            if (process.env.NORMAL_DISCOVERY_DEBUG) {
              // eslint-disable-next-line no-console
              console.warn('[Discovery] Multicast setup failed, will use broadcast:', err.message);
            }
            resolve(); // Continue with broadcast fallback
          }
        });
      });

      // Start bootstrap announcements
      this._startBootstrap();

      // Start regular keep-alive announcements
      this.announceTimer = setInterval(() => {
        this._sendAnnounce();
      }, this.announceIntervalMs);
      this.announceTimer.unref?.();

      // Start eviction timer
      this.evictionTimer = setInterval(
        () => {
          this._evictStaleMembers();
        },
        Math.min(5000, this.ttl / 4)
      );
      this.evictionTimer.unref?.();

      this.started = true;
    } catch (err) {
      if (this.onError) {
        this.onError(err);
      } else if (process.env.NORMAL_DISCOVERY_DEBUG) {
        // eslint-disable-next-line no-console
        console.warn('[Discovery] Start failed:', err.message);
      }
    }
  }

  /**
   * Stop the discovery service
   */
  stop() {
    if (!this.enabled || !this.started) return;

    try {
      if (this.announceTimer) {
        clearInterval(this.announceTimer);
        this.announceTimer = null;
      }
      if (this.evictionTimer) {
        clearInterval(this.evictionTimer);
        this.evictionTimer = null;
      }
      if (this.socket) {
        try {
          this.socket.dropMembership(this.multicastGroup);
        } catch {}
        this.socket.close();
        this.socket = null;
      }
      this.started = false;
    } catch (err) {
      if (this.onError) {
        this.onError(err);
      }
    }
  }

  /**
   * Get current members
   * @returns {MemberInfo[]}
   */
  getMembers() {
    return Array.from(this.members.values());
  }

  /**
   * Bootstrap: send announce messages rapidly
   */
  _startBootstrap() {
    const interval = setInterval(() => {
      this._sendAnnounce();
      this.bootstrapCount++;
      if (this.bootstrapCount >= this.bootstrapRetries) {
        clearInterval(interval);
      }
    }, this.bootstrapIntervalMs);
    interval.unref?.();
  }

  /**
   * Send announce message
   */
  _sendAnnounce() {
    if (!this.socket) return;

    const timestamp = Date.now();
    const nonce = generateNonce();

    // Use first local address or fallback
    const addr = this.localAddresses[0] || '127.0.0.1';

    const message = {
      type: 'announce',
      package: this.packageName,
      version: this.packageVersion,
      node_id: this.nodeId,
      addr: addr,
      port: this.cachePort,
      discovery_port: this.discoveryPort,
      timestamp: timestamp,
      ttl: this.ttl,
      nonce: nonce,
      connections: this.connectionHashes,
      metadata: {},
    };

    const signature = this._signMessage(message);
    message.signature = signature;

    const payload = Buffer.from(JSON.stringify(message), 'utf8');

    // Try multicast first
    try {
      this.socket.send(payload, this.discoveryPort, this.multicastGroup, (err) => {
        if (err && process.env.NORMAL_DISCOVERY_DEBUG) {
          // eslint-disable-next-line no-console
          console.warn('[Discovery] Multicast send failed:', err.message);
        }
      });
    } catch (err) {
      if (process.env.NORMAL_DISCOVERY_DEBUG) {
        // eslint-disable-next-line no-console
        console.warn('[Discovery] Multicast send error:', err.message);
      }
    }

    // Fallback to broadcast if allowed
    if (this.allowBroadcast) {
      try {
        this.socket.setBroadcast(true);
        this.socket.send(payload, this.discoveryPort, '255.255.255.255', () => {});
      } catch {}
    }

    // Send to static seeds
    for (const seed of this.fallbackSeeds) {
      try {
        const [host, portStr] = seed.split(':');
        const port = parseInt(portStr, 10) || this.discoveryPort;
        this.socket.send(payload, port, host, () => {});
      } catch {}
    }
  }

  /**
   * Handle incoming message
   */
  _handleMessage(msg, rinfo) {
    try {
      const data = JSON.parse(msg.toString('utf8'));

      // Ignore our own messages
      if (data.node_id === this.nodeId) return;

      // Verify signature
      if (!this._verifyMessage(data)) {
        if (process.env.NORMAL_DISCOVERY_DEBUG) {
          // eslint-disable-next-line no-console
          console.warn('[Discovery] Invalid signature from', rinfo.address);
        }
        return;
      }

      // Check replay protection
      if (!this._checkReplay(data)) {
        if (process.env.NORMAL_DISCOVERY_DEBUG) {
          // eslint-disable-next-line no-console
          console.warn('[Discovery] Replay detected from', rinfo.address);
        }
        return;
      }

      // Check package name match
      if (data.package !== this.packageName) {
        if (process.env.NORMAL_DISCOVERY_DEBUG) {
          // eslint-disable-next-line no-console
          console.warn('[Discovery] Package mismatch:', data.package, 'vs', this.packageName);
        }
        return;
      }

      // Check version compatibility
      if (!isVersionCompatible(data.version, this.packageVersion, this.versionPolicy)) {
        if (process.env.NORMAL_DISCOVERY_DEBUG) {
          // eslint-disable-next-line no-console
          console.warn(
            '[Discovery] Version incompatible:',
            data.version,
            'vs',
            this.packageVersion
          );
        }
        return;
      }

      // Process the message
      if (data.type === 'announce') {
        this._handleAnnounce(data);
      }
    } catch (err) {
      if (process.env.NORMAL_DISCOVERY_DEBUG) {
        // eslint-disable-next-line no-console
        console.warn('[Discovery] Message parse error:', err.message);
      }
    }
  }

  /**
   * Handle announce message
   */
  _handleAnnounce(data) {
    const existing = this.members.get(data.node_id);
    const memberInfo = {
      nodeId: data.node_id,
      addr: data.addr,
      port: data.port,
      discoveryPort: data.discovery_port,
      package: data.package,
      version: data.version,
      lastSeen: Date.now(),
      ttl: data.ttl,
      metadata: data.metadata || {},
      connections: data.connections || [],
    };

    if (!existing) {
      // New member
      this.members.set(data.node_id, memberInfo);
      if (this.onMemberJoin) {
        try {
          this.onMemberJoin(memberInfo);
        } catch {}
      }
      if (process.env.NORMAL_DISCOVERY_DEBUG) {
        // eslint-disable-next-line no-console
        console.log('[Discovery] Member joined:', data.node_id, data.addr + ':' + data.port);
      }
    } else {
      // Update existing member
      this.members.set(data.node_id, memberInfo);
      if (this.onMemberUpdate) {
        try {
          this.onMemberUpdate(memberInfo);
        } catch {}
      }
    }
  }

  /**
   * Evict stale members that haven't been seen within TTL * 1.5
   */
  _evictStaleMembers() {
    const now = Date.now();
    const toRemove = [];

    for (const [nodeId, member] of this.members.entries()) {
      const deadline = member.lastSeen + member.ttl * 1.5;
      if (now > deadline) {
        toRemove.push(nodeId);
      }
    }

    for (const nodeId of toRemove) {
      const member = this.members.get(nodeId);
      this.members.delete(nodeId);
      if (this.onMemberLeave) {
        try {
          this.onMemberLeave(member);
        } catch {}
      }
      if (process.env.NORMAL_DISCOVERY_DEBUG) {
        // eslint-disable-next-line no-console
        console.log('[Discovery] Member left:', nodeId);
      }
    }
  }

  /**
   * Sign a message with HMAC-SHA256
   */
  _signMessage(message) {
    const { signature, ...data } = message;
    const payload = JSON.stringify(data);
    const hmac = crypto.createHmac('sha256', this.secret);
    hmac.update(payload);
    return hmac.digest('hex');
  }

  /**
   * Verify message signature
   */
  _verifyMessage(message) {
    if (!message.signature) return false;
    const providedSig = message.signature;
    const expectedSig = this._signMessage(message);
    return providedSig === expectedSig;
  }

  /**
   * Check for replay attacks
   */
  _checkReplay(message) {
    const now = Date.now();
    const timestamp = message.timestamp;
    const nonce = message.nonce;

    // Check timestamp is within tolerance
    if (Math.abs(now - timestamp) > this.clockSkewToleranceMs) {
      return false;
    }

    // Check nonce hasn't been seen before
    const nonceKey = `${message.node_id}:${nonce}`;
    if (this.nonceCache.has(nonceKey)) {
      return false;
    }

    // Add nonce to cache
    this.nonceCache.add(nonceKey);

    // Limit cache size
    if (this.nonceCache.size > this.nonceCacheMaxSize) {
      const first = this.nonceCache.values().next().value;
      this.nonceCache.delete(first);
    }

    return true;
  }
}

module.exports = { Discovery, hashString, isVersionCompatible };

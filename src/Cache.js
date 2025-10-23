/**
 * Shared Memory Cache Implementation
 * 
 * This cache uses SharedArrayBuffer and Atomics to allow multiple Node.js
 * processes to share a common in-memory cache. It supports basic operations
 * like set, get, and clear, with TTL.
 * 
 * Note: This implementation assumes that the environment supports SharedArrayBuffer.
 */
const dgram = require('dgram');

// Keep track of all cache instances in this process to apply inbound invalidations
const __instances = new Set();
let __udpServer = null;
let __udpServerPort = null;

function __startUdpServer(port = 1983) {
  if (__udpServer) return; // already running
  __udpServerPort = port;
  const server = dgram.createSocket('udp4');
  server.on('error', (err) => {
    // Avoid crashing the process on bind errors; just log once
    if (process.env.NORMAL_CACHE_DEBUG) {
      // eslint-disable-next-line no-console
      console.warn('[SharedMemoryCache] UDP server error:', err.message);
    }
  });
  server.on('message', (msg /*, rinfo*/ ) => {
    try {
      const str = msg.toString('utf8');
      // Accept newline or comma separated lists
      const parts = str.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
      if (parts.length === 0) return;
      for (const key of parts) {
        for (const inst of __instances) {
          inst.expire(key, /*broadcast*/ false);
        }
      }
    } catch (e) {
      if (process.env.NORMAL_CACHE_DEBUG) {
        // eslint-disable-next-line no-console
        console.warn('[SharedMemoryCache] UDP message parse error:', e.message);
      }
    }
  });
  try {
    server.bind(port, '0.0.0.0', () => {
      if (process.env.NORMAL_CACHE_DEBUG) {
        // eslint-disable-next-line no-console
        console.log(`[SharedMemoryCache] UDP server listening on 0.0.0.0:${port}`);
      }
    });
  } catch (e) {
    if (process.env.NORMAL_CACHE_DEBUG) {
      // eslint-disable-next-line no-console
      console.warn('[SharedMemoryCache] Unable to bind UDP server:', e.message);
    }
  }
  __udpServer = server;
  // Do not keep the event loop alive because of the UDP server
  __udpServer.unref?.();
}

function __parsePeers(clusterOpt, defaultPort = 1983) {
  if (!clusterOpt) return [];
  const str = Array.isArray(clusterOpt) ? clusterOpt.join(',') : String(clusterOpt);
  return str
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(addr => {
      const [host, portStr] = addr.split(':');
      const port = portStr ? parseInt(portStr, 10) : defaultPort;
      return { host, port: Number.isFinite(port) ? port : defaultPort };
    });
}

class SharedMemoryCache {
  constructor(options = {}) {
    this.maxEntries = options.max != null ? options.max : (options.maxEntries || 1024); // alias support
    this.entrySize = options.entrySize || 1024; // bytes per entry
    this.headerSize = 64; // metadata

    // UDP cluster options
    this.clusterPeers = __parsePeers(options.cluster, options.port || options.listenPort || 1983);
    this.listenPort = options.port || options.listenPort || 1983;
    this._pendingKeys = new Set();
    this._batchIntervalMs = 500;
    this._udpClient = null;
    this._flushTimer = null;

    // Create shared memory region
    this.totalSize = this.headerSize + (this.maxEntries * this.entrySize);
    this.sharedBuffer = new SharedArrayBuffer(this.totalSize);

    // Memory layout: [header][entry0][entry1]...[entryN]
    this.header = new Int32Array(this.sharedBuffer, 0, 16);
    this.data = new Uint8Array(this.sharedBuffer, this.headerSize);

    // Initialize if first process
    if (Atomics.load(this.header, 0) === 0) {
      this.initializeHeader();
    }

    // Track instance for inbound invalidations
    __instances.add(this);

    // Start UDP server once per process (default port 1983)
    __startUdpServer(this.listenPort);

    // If peers provided, prepare UDP client and batching
    if (this.clusterPeers.length > 0) {
      this._udpClient = dgram.createSocket('udp4');
      this._flushTimer = setInterval(() => this._flushOutbound(), this._batchIntervalMs);
      this._flushTimer.unref?.();
    }
  }

  initializeHeader() {
    Atomics.store(this.header, 0, 1); // initialized flag
    Atomics.store(this.header, 1, 0); // entry count
    Atomics.store(this.header, 2, 0); // next write index
  }

  hash(key) {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % this.maxEntries;
  }

  set(key, value, ttl = 300) {
    const expires = Date.now() + (ttl * 1000);
    const entry = { key, value, expires };
    const serialized = JSON.stringify(entry);
    
    if (serialized.length > this.entrySize - 8) return false;
    
    const index = this.hash(key);
    const offset = index * this.entrySize;
    
    // Write length atomically, then data
    const view = new DataView(this.sharedBuffer, this.headerSize + offset);
    const encoder = new TextEncoder();
    const bytes = encoder.encode(serialized);
    
    // Copy data first, then update length atomically (ensures consistency)
    new Uint8Array(this.sharedBuffer, this.headerSize + offset + 4, bytes.length).set(bytes);
    Atomics.store(new Int32Array(this.sharedBuffer, this.headerSize + offset, 1), 0, bytes.length);
    
    // Update global counter
    Atomics.add(this.header, 1, 1);

    // Record key for outbound invalidation to peers
    if (this._udpClient && this.clusterPeers.length > 0) {
      this._pendingKeys.add(String(key));
    }
    return true;
  }

  get(key) {
    const index = this.hash(key);
    const offset = index * this.entrySize;
    
    // Read length atomically
    const length = Atomics.load(new Int32Array(this.sharedBuffer, this.headerSize + offset, 1), 0);
    if (length === 0) return null;
    
    const decoder = new TextDecoder();
    const bytes = new Uint8Array(this.sharedBuffer, this.headerSize + offset + 4, length);
    const serialized = decoder.decode(bytes);
    
    try {
      const entry = JSON.parse(serialized);
      
      if (entry.key === key && entry.expires > Date.now()) {        
        return entry.value;
      }
    } catch (e) {
      return null;
    }
    
    return null;
  }

  clear() {
    // Reset all entries atomically
    for (let i = 0; i < this.maxEntries; i++) {
      const offset = i * this.entrySize;
      Atomics.store(new Int32Array(this.sharedBuffer, this.headerSize + offset, 1), 0, 0);
    }
    Atomics.store(this.header, 1, 0);
  }

  expire(key, broadcast = false) {
    // Find slot and clear if key matches
    const index = this.hash(key);
    const offset = index * this.entrySize;
    const lenView = new Int32Array(this.sharedBuffer, this.headerSize + offset, 1);
    const length = Atomics.load(lenView, 0);
    if (length > 0) {
      try {
        const decoder = new TextDecoder();
        const bytes = new Uint8Array(this.sharedBuffer, this.headerSize + offset + 4, length);
        const serialized = decoder.decode(bytes);
        const entry = JSON.parse(serialized);
        if (entry && entry.key === key) {
          // Mark as empty (length = 0)
          Atomics.store(lenView, 0, 0);
        }
      } catch (_) {
        // On parse errors, best-effort: clear slot
        Atomics.store(lenView, 0, 0);
      }
    }
    // Optionally broadcast (off by default to avoid loops)
    if (broadcast && this._udpClient && this.clusterPeers.length > 0) {
      this._pendingKeys.add(String(key));
    }
  }

  _flushOutbound() {
    if (!this._udpClient || this.clusterPeers.length === 0) return;
    if (this._pendingKeys.size === 0) return;
    const payload = Array.from(this._pendingKeys).join('\n');
    this._pendingKeys.clear();
    const buf = Buffer.from(payload, 'utf8');
    for (const peer of this.clusterPeers) {
      try {
        this._udpClient.send(buf, peer.port, peer.host, (err) => {
          if (err && process.env.NORMAL_CACHE_DEBUG) {
            // eslint-disable-next-line no-console
            console.warn('[SharedMemoryCache] UDP send error to', `${peer.host}:${peer.port}`, err.message);
          }
        });
      } catch (e) {
        if (process.env.NORMAL_CACHE_DEBUG) {
          // eslint-disable-next-line no-console
          console.warn('[SharedMemoryCache] UDP send failed:', e.message);
        }
      }
    }
  }
}

module.exports = { Cache: SharedMemoryCache };
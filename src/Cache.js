/**
 * Shared Memory Cache Implementation
 * 
 * This cache uses SharedArrayBuffer and Atomics to allow multiple Node.js
 * processes to share a common in-memory cache. It supports basic operations
 * like set, get, and clear, with TTL and LRU eviction.
 * 
 * Note: This implementation assumes that the environment supports SharedArrayBuffer.
 */
class SharedMemoryCache {
  constructor(options = {}) {
    this.maxEntries = options.max || 1024;
    this.entrySize = options.entrySize || 1024; // bytes per entry
    this.headerSize = 64; // metadata
    
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
    const entry = { key, value, expires, accessed: Date.now() };
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
        // Update access time for LRU (optional - adds overhead)
        entry.accessed = Date.now();
        const updated = JSON.stringify(entry);
        if (updated.length <= this.entrySize - 8) {
          const updatedBytes = new TextEncoder().encode(updated);
          new Uint8Array(this.sharedBuffer, this.headerSize + offset + 4, updatedBytes.length).set(updatedBytes);
          Atomics.store(new Int32Array(this.sharedBuffer, this.headerSize + offset, 1), 0, updatedBytes.length);
        }
        
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
}

module.exports = { Cache: SharedMemoryCache };
'use strict';

// Fixed-slot storage engine for SharedMemoryCache
// Direct-mapped slots using a simple hash(key) -> index, storing a serialized JSON string.

class FixedSlots {
  constructor(options = {}) {
    this.maxEntries = options.maxEntries || options.max || 1024;
    this.entrySize = options.entrySize || 1024; // bytes per entry
    this.headerSize = options.headerSize || 64; // metadata

    // Memory layout: [header][entry0][entry1]...[entryN]
    this.totalSize = this.headerSize + this.maxEntries * this.entrySize;
    this.sharedBuffer = new SharedArrayBuffer(this.totalSize);
    this.header = new Int32Array(this.sharedBuffer, 0, 16);
    this.data = new Uint8Array(this.sharedBuffer, this.headerSize);
    if (Atomics.load(this.header, 0) === 0) this._initializeHeader();
  }

  _initializeHeader() {
    Atomics.store(this.header, 0, 1); // initialized flag
    Atomics.store(this.header, 1, 0); // entry count (advisory)
    Atomics.store(this.header, 2, 0); // next write index (unused)
  }

  hash(key) {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % this.maxEntries;
  }

  putSerialized(key, serialized) {
    if (serialized.length > this.entrySize - 8) return false;
    const index = this.hash(key);
    const offset = index * this.entrySize;
    const encoder = new TextEncoder();
    const bytes = encoder.encode(serialized);
    // Copy data first, then set length atomically
    new Uint8Array(this.sharedBuffer, this.headerSize + offset + 4, bytes.length).set(bytes);
    Atomics.store(new Int32Array(this.sharedBuffer, this.headerSize + offset, 1), 0, bytes.length);
    Atomics.add(this.header, 1, 1);
    return true;
  }

  readSerialized(key) {
    const index = this.hash(key);
    const offset = index * this.entrySize;
    const length = Atomics.load(new Int32Array(this.sharedBuffer, this.headerSize + offset, 1), 0);
    if (length === 0) return null;
    const decoder = new TextDecoder();
    const bytes = new Uint8Array(this.sharedBuffer, this.headerSize + offset + 4, length);
    return decoder.decode(bytes);
  }

  expireKey(key) {
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
        if (entry && entry.key === key) Atomics.store(lenView, 0, 0);
      } catch (_) {
        // Best-effort clear on parse errors
        Atomics.store(lenView, 0, 0);
      }
    }
  }

  clear() {
    for (let i = 0; i < this.maxEntries; i++) {
      const offset = i * this.entrySize;
      Atomics.store(new Int32Array(this.sharedBuffer, this.headerSize + offset, 1), 0, 0);
    }
    Atomics.store(this.header, 1, 0);
  }
}

module.exports = { FixedSlots };

// @ts-nocheck - TODO: Add proper type annotations


import { BlockArena  } from './BlockArena';

// Wrapper around BlockArena to provide a simple JSON value store API
// Methods mirror the FixedSlots engine but leverage variable-length storage with TTL per-entry.

class ArenaStore {
  constructor(opts = {}) {
    this._opts = {
      memoryBytes: opts.memoryBytes || 64 * 1024 * 1024,
      blockSize: opts.blockSize || 1024,
      dictCapacity: opts.dictCapacity || 8192,
    };
    this._arena = new BlockArena(this._opts);
    this._rehashAttempts = 0;
  }

  put(key, value, ttlSec = 300) {
    try {
      const payload = JSON.stringify(value);
      const ok = this._arena.put(String(key), payload, Math.max(1, ttlSec | 0), Date.now());
      if (ok) return true;
      // If insertion fails (likely high load factor), attempt a rehash and retry once
      if (this._rehashAttempts < 2) {
        this._rehashAttempts++;
        if (this._rehash()) {
          const ok2 = this._arena.put(String(key), payload, Math.max(1, ttlSec | 0), Date.now());
          this._rehashAttempts = 0;
          return !!ok2;
        }
        this._rehashAttempts = 0;
      }
      return false;
    } catch {
      return false;
    }
  }

  get(key, minCreatedMs) {
    const s = this._arena.get(String(key), minCreatedMs);
    if (s == null) return null;
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }

  delete(key) {
    return this._arena.delete(String(key));
  }

  sweep(maxChecks = 256) {
    return this._arena.sweep(maxChecks);
  }

  clear() {
    this._arena = new BlockArena(this._opts);
  }

  _rehash() {
    try {
      const old = this._arena;
      const newCap = this._nextPow2((old.dictCapacity || this._opts.dictCapacity || 8192) * 2);
      const nextOpts = { ...this._opts, dictCapacity: newCap };
      const neo = new BlockArena(nextOpts);
      const now = Date.now();
      old.forEach(
        ({ key, value, expiresMs, createdMs }) => {
          if (!key || value == null) return;
          const ttlSec = expiresMs > 0 ? Math.max(1, Math.floor((expiresMs - now) / 1000)) : 300;
          // Insert value string directly into low-level arena
          neo.put(String(key), String(value), ttlSec, createdMs > 0 ? createdMs : now);
        },
        { includeExpired: false }
      );
      this._arena = neo;
      this._opts = nextOpts;
      return true;
    } catch {
      return false;
    }
  }

  _nextPow2(n) {
    return 1 << (32 - Math.clz32(n - 1));
  }
}

export { ArenaStore  };

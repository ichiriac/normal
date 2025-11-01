'use strict';

// A shared block arena storing variable-length strings in fixed-size blocks.
// Open-addressed dictionary maps key -> { keyHead, keyLen, valHead, valLen, expires }.
// Expiration frees only the chain blocks; no movement of other contents.

class BlockArena {
  constructor(opts = {}) {
    this.blockSize = opts.blockSize || 1024; // bytes per block (>= 32)
    this.entryBytes = 40; // dictionary entry size (aligned)
    this.dictCapacity = this._nextPow2(opts.dictCapacity || 8192);
    this.memoryBytes = opts.memoryBytes || 64 * 1024 * 1024;

    this.headerBytes = 64;
    const dictBytes = this.dictCapacity * this.entryBytes;
    const blocksBytes = this.memoryBytes - this.headerBytes - dictBytes;
    if (blocksBytes < this.blockSize * 8) {
      throw new Error('BlockArena: not enough memory for blocks region');
    }

    this.totalBlocks = Math.floor(blocksBytes / this.blockSize);
    this.buffer = new SharedArrayBuffer(
      this.headerBytes + dictBytes + this.totalBlocks * this.blockSize
    );

    this.header = new Int32Array(this.buffer, 0, 16);
    this.dictStart = this.headerBytes;
    this.blocksStart = this.headerBytes + dictBytes;

    // Views
    this.dictView = new DataView(this.buffer, this.dictStart, this.dictCapacity * this.entryBytes);
    this.blocksView = new DataView(
      this.buffer,
      this.blocksStart,
      this.totalBlocks * this.blockSize
    );

    // Initialize once
    if (Atomics.load(this.header, 0) === 0) {
      Atomics.store(this.header, 0, 0x424c4b41); // 'BLKA'
      Atomics.store(this.header, 1, 1); // version
      Atomics.store(this.header, 2, this.blockSize);
      Atomics.store(this.header, 3, this.totalBlocks);
      Atomics.store(this.header, 4, -1); // free list head (block index)
      Atomics.store(this.header, 5, this.dictCapacity);
      Atomics.store(this.header, 6, 0); // dict used (advisory)
      this._initFreeList();
      this._clearDict();
    }

    // Per-block header layout
    this.BHDR_NEXT_OFF = 0; // int32
    this.BHDR_USED_OFF = 4; // uint16
    this.BHDR_BYTES = 8;
    this.BDATA_OFF = this.BHDR_BYTES;
    this.BDATA_BYTES = this.blockSize - this.BHDR_BYTES;
    // Reusable text encoder/decoder to avoid reallocation per op
    this._encoder = new TextEncoder();
    this._decoder = new TextDecoder();
  }

  // Public API
  put(key, strValue, ttlSec = 300) {
    const now = Date.now();
    const expires = now + ttlSec * 1000;
    const keyStr = String(key);
    const keyBytes = this._encode(keyStr);
    const valBytes = this._encode(String(strValue));
    const hash = this._fnv1a32(keyStr);

    const idx = this._findOrInsertKey(hash, keyBytes);
    if (idx < 0) return false;
    const entryOff = idx * this.entryBytes;
    const state = this.dictView.getInt32(entryOff, true);
    if (state !== 1) return false; // should be locked

    // Existing value head
    const oldValHead = this.dictView.getInt32(entryOff + 16, true);

    // Allocate key chain if new
    let kHead = this.dictView.getInt32(entryOff + 8, true);
    if (kHead === -1) {
      kHead = this._allocChain(keyBytes.length);
      if (kHead < 0) {
        this.dictView.setInt32(entryOff, 3, true); // tombstone
        return false;
      }
      this._writeChain(kHead, keyBytes);
      this.dictView.setInt32(entryOff + 8, kHead, true);
      this.dictView.setUint32(entryOff + 12, keyBytes.length, true);
    }

    // Allocate value chain
    const vHead = this._allocChain(valBytes.length);
    if (vHead < 0) {
      this.dictView.setInt32(entryOff, 3, true);
      return false;
    }
    this._writeChain(vHead, valBytes);
    this.dictView.setInt32(entryOff + 16, vHead, true);
    this.dictView.setUint32(entryOff + 20, valBytes.length, true);
    this._setExpires(entryOff, expires);

    // Publish ready
    this.dictView.setInt32(entryOff, 2, true);
    if (oldValHead >= 0) this._freeChain(oldValHead);
    return true;
  }

  get(key) {
    const keyStr = String(key);
    const hash = this._fnv1a32(keyStr);
    const idx = this._probe(hash, (off) => {
      const state = this.dictView.getInt32(off, true);
      if (state !== 2) return false;
      if (this._isExpired(off)) return 'expired';
      const kHead = this.dictView.getInt32(off + 8, true);
      const kLen = this.dictView.getUint32(off + 12, true);
      return this._keyEquals(kHead, kLen, keyStr);
    });
    if (idx < 0) return null;
    const entryOff = idx * this.entryBytes;
    if (this._isExpired(entryOff)) {
      this.delete(key);
      return null;
    }
    const vHead = this.dictView.getInt32(entryOff + 16, true);
    const vLen = this.dictView.getUint32(entryOff + 20, true);
    if (vHead < 0 || vLen === 0) return null;
    const bytes = this._readChain(vHead, vLen);
    return this._decode(bytes);
  }

  delete(key) {
    const keyStr = String(key);
    const hash = this._fnv1a32(keyStr);
    const idx = this._probe(hash, (off) => {
      const state = this.dictView.getInt32(off, true);
      if (state !== 2) return false;
      const kHead = this.dictView.getInt32(off + 8, true);
      const kLen = this.dictView.getUint32(off + 12, true);
      return this._keyEquals(kHead, kLen, keyStr);
    });
    if (idx < 0) return false;
    const entryOff = idx * this.entryBytes;
    if (!this._lock(entryOff)) return false;
    const kHead = this.dictView.getInt32(entryOff + 8, true);
    const vHead = this.dictView.getInt32(entryOff + 16, true);
    if (kHead >= 0) this._freeChain(kHead);
    if (vHead >= 0) this._freeChain(vHead);
    this._clearEntry(entryOff);
    this.dictView.setInt32(entryOff, 0, true);
    return true;
  }

  // Iterate over entries; callback receives { key, value, expiresMs } where value is stored string
  forEach(callback, opts = {}) {
    const includeExpired = !!opts.includeExpired;
    const limit = Number.isFinite(opts.limit) ? opts.limit : Infinity;
    let count = 0;
    for (let i = 0; i < this.dictCapacity; i++) {
      const off = i * this.entryBytes;
      const state = this.dictView.getInt32(off, true);
      if (state !== 2) continue;
      if (!includeExpired && this._isExpired(off)) continue;
      const kHead = this.dictView.getInt32(off + 8, true);
      const kLen = this.dictView.getUint32(off + 12, true);
      const vHead = this.dictView.getInt32(off + 16, true);
      const vLen = this.dictView.getUint32(off + 20, true);
      const keyBytes = this._readChain(kHead, kLen);
      const valBytes = this._readChain(vHead, vLen);
      const keyStr = keyBytes ? this._decode(keyBytes) : null;
      const valStr = valBytes ? this._decode(valBytes) : null;
      const expiresMs = new Float64Array(
        this.dictView.buffer,
        this.dictView.byteOffset + off + 24,
        1
      )[0];
      callback({ key: keyStr, value: valStr, expiresMs });
      count++;
      if (count >= limit) break;
    }
    return count;
  }

  // Background: sweep a slice of dictionary for expired entries
  sweep(maxChecks = 256) {
    const cap = this.dictCapacity;
    const start = (Atomics.add(this.header, 7, maxChecks) >>> 0) % cap; // use header[7] as scan cursor
    let checked = 0,
      freed = 0;
    for (let i = 0; i < maxChecks; i++) {
      const idx = (start + i) & (cap - 1);
      const off = idx * this.entryBytes;
      const state = this.dictView.getInt32(off, true);
      if (state !== 2) continue;
      checked++;
      if (this._isExpired(off)) {
        if (this._lock(off)) {
          const kHead = this.dictView.getInt32(off + 8, true);
          const vHead = this.dictView.getInt32(off + 16, true);
          if (kHead >= 0) this._freeChain(kHead);
          if (vHead >= 0) this._freeChain(vHead);
          this._clearEntry(off);
          this.dictView.setInt32(off, 0, true);
          freed++;
        }
      }
    }
    return { checked, freed };
  }

  // Dictionary internals
  _findOrInsertKey(hash, keyBytes) {
    const cap = this.dictCapacity;
    let firstTomb = -1;
    for (let i = 0; i < cap; i++) {
      const idx = (hash + i) & (cap - 1);
      const off = idx * this.entryBytes;
      const state = Atomics.load(
        new Int32Array(this.dictView.buffer, this.dictView.byteOffset + off, 1),
        0
      );
      if (state === 0) {
        if (this._casState(off, 0, 1)) {
          // lock empty
          this._initEntry(off, hash);
          Atomics.add(this.header, 6, 1);
          return idx;
        }
      } else if (state === 3) {
        if (firstTomb === -1) firstTomb = idx;
      } else if (state === 2) {
        const storedHash = this.dictView.getUint32(off + 4, true);
        if (storedHash === hash) {
          const kHead = this.dictView.getInt32(off + 8, true);
          const kLen = this.dictView.getUint32(off + 12, true);
          if (this._keyEqualsBytes(kHead, kLen, keyBytes)) {
            if (this._casState(off, 2, 1)) return idx; // lock existing
          }
        }
      }
    }
    if (firstTomb >= 0) {
      const off = firstTomb * this.entryBytes;
      if (this._casState(off, 3, 1)) {
        this._initEntry(off, hash);
        return firstTomb;
      }
    }
    return -1;
  }

  _probe(hash, predicate) {
    const cap = this.dictCapacity;
    for (let i = 0; i < cap; i++) {
      const idx = (hash + i) & (cap - 1);
      const off = idx * this.entryBytes;
      const state = this.dictView.getInt32(off, true);
      if (state === 0) return -1;
      if (state === 2) {
        if (this.dictView.getUint32(off + 4, true) !== hash) continue;
        const r = predicate(off);
        if (r === true) return idx;
        if (r === 'expired') return idx;
      }
    }
    return -1;
  }

  _initEntry(off, hash) {
    this.dictView.setInt32(off + 0, 1, true); // state=locked
    this.dictView.setUint32(off + 4, hash, true);
    this.dictView.setInt32(off + 8, -1, true);
    this.dictView.setUint32(off + 12, 0, true);
    this.dictView.setInt32(off + 16, -1, true);
    this.dictView.setUint32(off + 20, 0, true);
    this._setExpires(off, 0);
  }

  _clearEntry(off) {
    this.dictView.setUint32(off + 4, 0, true);
    this.dictView.setInt32(off + 8, -1, true);
    this.dictView.setUint32(off + 12, 0, true);
    this.dictView.setInt32(off + 16, -1, true);
    this.dictView.setUint32(off + 20, 0, true);
    this._setExpires(off, 0);
  }

  _setExpires(off, ms) {
    new Float64Array(this.dictView.buffer, this.dictView.byteOffset + off + 24, 1)[0] = ms;
  }

  _isExpired(off) {
    const exp = new Float64Array(this.dictView.buffer, this.dictView.byteOffset + off + 24, 1)[0];
    return exp > 0 && Date.now() > exp;
  }

  _casState(off, from, to) {
    const view = new Int32Array(this.dictView.buffer, this.dictView.byteOffset + off, 1);
    return Atomics.compareExchange(view, 0, from, to) === from;
  }

  _lock(off) {
    return this._casState(off, 2, 1);
  }

  _keyEquals(kHead, kLen, keyStr) {
    const kb = this._readChain(kHead, kLen);
    if (!kb) return false;
    return this._decode(kb) === keyStr;
  }

  _keyEqualsBytes(kHead, kLen, keyBytes) {
    const kb = this._readChain(kHead, kLen);
    if (!kb) return false;
    if (kb.length !== keyBytes.length) return false;
    for (let i = 0; i < kb.length; i++) {
      if (kb[i] !== keyBytes[i]) return false;
    }
    return true;
  }

  // Blocks region
  _initFreeList() {
    for (let i = 0; i < this.totalBlocks; i++) {
      this._blockSetUsed(i, 0);
      this._blockSetNext(i, i - 1); // chain backwards; -1 for first
    }
    Atomics.store(this.header, 4, this.totalBlocks - 1);
  }

  _allocChain(len) {
    const n = Math.ceil(len / this.BDATA_BYTES);
    let head = -1,
      prev = -1;
    for (let i = 0; i < n; i++) {
      const blk = this._popFree();
      if (blk < 0) {
        if (head >= 0) this._freeChain(head);
        return -1;
      }
      this._blockSetUsed(blk, 0);
      this._blockSetNext(blk, -1);
      if (head < 0) head = blk;
      if (prev >= 0) this._blockSetNext(prev, blk);
      prev = blk;
    }
    return head;
  }

  _writeChain(head, bytes) {
    let blk = head;
    let off = 0;
    while (blk >= 0) {
      const n = Math.min(this.BDATA_BYTES, bytes.length - off);
      this._blockWriteData(blk, bytes.subarray(off, off + n));
      this._blockSetUsed(blk, n);
      off += n;
      if (off >= bytes.length) break;
      blk = this._blockNext(blk);
    }
  }

  _readChain(head, len) {
    const out = new Uint8Array(len);
    let blk = head,
      off = 0;
    while (blk >= 0 && off < len) {
      const used = this._blockUsed(blk);
      const n = Math.min(used, len - off);
      this._blockReadData(blk, out, off, n);
      off += n;
      blk = this._blockNext(blk);
    }
    if (off !== len) return null;
    return out;
  }

  _freeChain(head) {
    let blk = head;
    while (blk >= 0) {
      const next = this._blockNext(blk);
      this._blockSetUsed(blk, 0);
      this._blockSetNext(blk, -1);
      this._pushFree(blk);
      blk = next;
    }
  }

  _pushFree(idx) {
    const headIdx = 4; // header[4] = freeHead
    let cur;
    do {
      cur = Atomics.load(this.header, headIdx);
      this._blockSetNext(idx, cur);
    } while (Atomics.compareExchange(this.header, headIdx, cur, idx) !== cur);
  }

  _popFree() {
    const headIdx = 4;
    while (true) {
      const cur = Atomics.load(this.header, headIdx);
      if (cur === -1) return -1;
      if (cur < 0 || cur >= this.totalBlocks) {
        // defensive guard
        Atomics.store(this.header, headIdx, -1);
        return -1;
      }
      const next = this._blockNext(cur);
      if (Atomics.compareExchange(this.header, headIdx, cur, next) === cur) return cur;
    }
  }

  _blockOff(i) {
    return i * this.blockSize;
  }
  _blockNext(i) {
    if (i < 0 || i >= this.totalBlocks) return -1;
    return this.blocksView.getInt32(this._blockOff(i) + 0, true);
  }
  _blockSetNext(i, v) {
    this.blocksView.setInt32(this._blockOff(i) + 0, v, true);
  }
  _blockUsed(i) {
    if (i < 0 || i >= this.totalBlocks) return 0;
    return this.blocksView.getUint16(this._blockOff(i) + 4, true);
  }
  _blockSetUsed(i, v) {
    this.blocksView.setUint16(this._blockOff(i) + 4, v, true);
  }
  _blockWriteData(i, bytes) {
    if (i < 0 || i >= this.totalBlocks) return;
    const base = this._blockOff(i) + this.BDATA_OFF;
    new Uint8Array(this.blocksView.buffer, base, bytes.length).set(bytes);
  }
  _blockReadData(i, out, off, n) {
    if (i < 0 || i >= this.totalBlocks) return;
    const base = this._blockOff(i) + this.BDATA_OFF;
    const src = new Uint8Array(this.blocksView.buffer, base, n);
    out.set(src, off);
  }

  _clearDict() {
    for (let i = 0; i < this.dictCapacity; i++) {
      const off = i * this.entryBytes;
      this.dictView.setInt32(off + 0, 0, true); // state = empty
    }
  }

  // Utils
  _encode(s) {
    return this._encoder.encode(s);
  }
  _decode(b) {
    return this._decoder.decode(b);
  }
  _nextPow2(n) {
    return 1 << (32 - Math.clz32(n - 1));
  }
  _fnv1a32(str) {
    let h = 0x811c9dc5 | 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }
}

module.exports = { BlockArena };

// @ts-nocheck - TODO: Add proper type annotations


class CacheMetrics {
  constructor(enabled = true) {
    this._enabled = enabled !== false;
    this.reset();
  }

  get enabled() {
    return this._enabled;
  }

  reset() {
    const enabled = this._enabled;
    this._data = {
      enabled,
      setCount: 0,
      getCount: 0,
      hitCount: 0,
      missCount: 0,
      expireCount: 0,
      sweepCount: 0,
      sweepFreed: 0,
      udpSentBatches: 0,
      udpSentKeys: 0,
      setTimeNs: 0n,
      getTimeNs: 0n,
      maxSetNs: 0n,
      maxGetNs: 0n,
      lastSetNs: 0n,
      lastGetNs: 0n,
      startTime: Date.now(),
    };
  }

  _now() {
    return process.hrtime.bigint();
  }

  setStart() {
    return this._enabled ? this._now() : 0n;
  }
  setEnd(t0) {
    if (!this._enabled) return;
    const d = this._data;
    d.setCount++;
    const dt = this._now() - t0;
    d.lastSetNs = dt;
    d.setTimeNs += dt;
    if (dt > d.maxSetNs) d.maxSetNs = dt;
  }

  getStart() {
    return this._enabled ? this._now() : 0n;
  }
  getHit(t0) {
    if (!this._enabled) return;
    const d = this._data;
    d.getCount++;
    d.hitCount++;
    const dt = this._now() - t0;
    d.lastGetNs = dt;
    d.getTimeNs += dt;
    if (dt > d.maxGetNs) d.maxGetNs = dt;
  }
  getMiss(t0) {
    if (!this._enabled) return;
    const d = this._data;
    d.getCount++;
    d.missCount++;
    const dt = this._now() - t0;
    d.lastGetNs = dt;
    d.getTimeNs += dt;
    if (dt > d.maxGetNs) d.maxGetNs = dt;
  }

  incExpire() {
    if (this._enabled) this._data.expireCount++;
  }
  onSweep(res) {
    if (this._enabled) {
      this._data.sweepCount++;
      this._data.sweepFreed += res?.freed || 0;
    }
  }
  onUdpFlush(count) {
    if (this._enabled) {
      this._data.udpSentBatches++;
      this._data.udpSentKeys += count || 0;
    }
  }

  snapshot() {
    const m = this._data;
    if (!m.enabled) return { enabled: false };
    const us = (ns) => Number(ns) / 1000;
    const uptimeSec = (Date.now() - m.startTime) / 1000;
    return {
      enabled: true,
      uptimeSec: Number(uptimeSec.toFixed(2)),
      counts: {
        set: m.setCount,
        get: m.getCount,
        hit: m.hitCount,
        miss: m.missCount,
        expire: m.expireCount,
        sweeps: m.sweepCount,
        sweepFreed: m.sweepFreed,
        udpBatches: m.udpSentBatches,
        udpKeys: m.udpSentKeys,
      },
      latencyUs: {
        avgSet: m.setCount ? us(m.setTimeNs / BigInt(m.setCount)) : 0,
        avgGet: m.getCount ? us(m.getTimeNs / BigInt(m.getCount)) : 0,
        maxSet: us(m.maxSetNs),
        maxGet: us(m.maxGetNs),
        lastSet: us(m.lastSetNs),
        lastGet: us(m.lastGetNs),
      },
    };
  }
}

export { CacheMetrics  };

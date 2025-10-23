"use strict";

const dgram = require('dgram');

// Parses cluster peers from string/array. Reused by Cache.
function parsePeers(clusterOpt, defaultPort = 1983) {
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

// Singleton UDP server per-process; supports multiple subscribers.
class UdpServer {
	constructor(port) {
		this.port = port;
		this.subscribers = new Set();
		this.server = dgram.createSocket('udp4');
		this.server.on('error', (err) => {
			if (process.env.NORMAL_CACHE_DEBUG) {
				// eslint-disable-next-line no-console
				console.warn('[Cluster] UDP server error:', err.message);
			}
		});
		this.server.on('message', (msg) => {
			try {
				const parts = msg.toString('utf8').split(/[\n,]/).map(s => s.trim()).filter(Boolean);
				if (parts.length === 0) return;
				for (const sub of this.subscribers) {
					try { sub(parts); } catch { /* ignore subscriber errors */ }
				}
			} catch (e) {
				if (process.env.NORMAL_CACHE_DEBUG) {
					// eslint-disable-next-line no-console
					console.warn('[Cluster] UDP message parse error:', e.message);
				}
			}
		});
		try {
			this.server.bind(port, '0.0.0.0', () => {
				if (process.env.NORMAL_CACHE_DEBUG) {
					// eslint-disable-next-line no-console
					console.log(`[Cluster] UDP server listening on 0.0.0.0:${port}`);
				}
			});
		} catch (e) {
			if (process.env.NORMAL_CACHE_DEBUG) {
				// eslint-disable-next-line no-console
				console.warn('[Cluster] Unable to bind UDP server:', e.message);
			}
		}
		this.server.unref?.();
	}
	subscribe(cb) { this.subscribers.add(cb); return () => this.subscribers.delete(cb); }
}

let __server = null;

function ensureServer(port) {
	if (__server) return __server;
	__server = new UdpServer(port);
	return __server;
}

// Outbound batching client per Cache instance
class ClusterTransport {
	constructor({ listenPort = 1983, peers = [], onKeys, batchIntervalMs = 500, onFlush }) {
		this.peers = peers;
		this.onFlush = onFlush;
		this._udpClient = null;
		this._pending = new Set();
		this._timer = null;
		// Inbound subscriptions
		if (typeof onKeys === 'function') {
			const srv = ensureServer(listenPort);
			this._unsubscribe = srv.subscribe(onKeys);
		}
		if (this.peers.length > 0) {
			this._udpClient = dgram.createSocket('udp4');
			this._timer = setInterval(() => this.flush(), batchIntervalMs);
			this._timer.unref?.();
		}
	}
	queue(key) { if (this._udpClient && this.peers.length > 0) this._pending.add(String(key)); }
	flush() {
		if (!this._udpClient || this.peers.length === 0) return;
		if (this._pending.size === 0) return;
		const payload = Array.from(this._pending).join('\n');
		this._pending.clear();
		const count = payload ? payload.split('\n').length : 0;
		if (this.onFlush) { try { this.onFlush(count); } catch {} }
		const buf = Buffer.from(payload, 'utf8');
		for (const peer of this.peers) {
			try {
				this._udpClient.send(buf, peer.port, peer.host, () => {});
			} catch (e) {
				if (process.env.NORMAL_CACHE_DEBUG) {
					// eslint-disable-next-line no-console
					console.warn('[Cluster] UDP send failed:', e.message);
				}
			}
		}
	}
	stop() {
		try { if (this._timer) clearInterval(this._timer); } catch {}
		try { if (this._udpClient) this._udpClient.close(); } catch {}
		try { if (this._unsubscribe) this._unsubscribe(); } catch {}
		this._timer = null; this._udpClient = null; this._unsubscribe = null;
	}
}

module.exports = { ClusterTransport, parsePeers };


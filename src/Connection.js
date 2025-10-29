'use strict';
const knex = require('knex');
const { Discovery, hashString } = require('./cache/Discovery');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

/**
 * Simple Knex-backed connection wrapper.
 * Supports 'pg' (default) and 'sqlite3' via env or opts.
 *
 * Env (pg):
 *  - PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
 * Env (sqlite3):
 *  - SQLITE_FILENAME
 */
class Connection {
  /**
   * @param {object} [opts]
   * @param {'pg'|'sqlite3'|'mysql2'} [opts.client]
   * @param {object} [opts.connection]
   * @param {object} [opts.pool]
   * @param {object} [opts.discovery] Discovery options
   */
  constructor(opts = {}) {
    this.config = this._buildConfig(opts);
    this._knex = null;
    this._discovery = null;
    this._discoveryOptions = opts.discovery || {};
  }

  _buildConfig(opts) {
    const client = opts.client || process.env.DB_CLIENT || 'pg';

    if (client === 'pg') {
      const connection = opts.connection || {
        host: process.env.PGHOST || 'localhost',
        port: +(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE || 'postgres',
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || 'postgres',
        ssl: process.env.PGSSL ? { rejectUnauthorized: false } : undefined,
      };
      return {
        client: 'pg',
        connection,
        pool: opts.pool || { min: 0, max: 10 },
        acquireConnectionTimeout: 15000,
      };
    }

    if (client === 'sqlite3') {
      const filename =
        (opts.connection && opts.connection.filename) || process.env.SQLITE_FILENAME || ':memory:';
      return {
        client: 'sqlite3',
        debug: opts.debug || false,
        connection: { filename },
        useNullAsDefault: true,
        pool: opts.pool || { min: 1, max: 1 },
      };
    }

    // Fallback for other clients (e.g. mysql2)
    return {
      client,
      connection: opts.connection,
      pool: opts.pool,
    };
  }

  // Lazily create Knex instance
  get instance() {
    return this._knex || (this._knex = knex(this.config));
  }

  // Ensure connectivity (simple ping)
  async connect() {
    const kx = this.instance;
    await kx.raw('select 1');
    return kx;
  }

  // Query builder entry
  table(name) {
    return this.instance(name);
  }

  // Raw SQL
  raw(sql, bindings) {
    return this.instance.raw(sql, bindings);
  }

  // Transaction helper
  transaction(work, config) {
    return this.instance.transaction(work, config);
  }

  // Close and cleanup
  async destroy() {
    if (this._discovery) {
      this._discovery.stop();
      this._discovery = null;
    }
    if (this._knex) {
      await this._knex.destroy();
      this._knex = null;
    }
  }

  /**
   * Get connection hash (used for discovery)
   */
  getConnectionHash() {
    const configCopy = {
      client: this.config.client,
      connection: this.config.connection,
    };
    const serialized = JSON.stringify(configCopy);
    return hashString(serialized);
  }

  /**
   * Get or create discovery instance
   */
  getDiscovery() {
    if (this._discovery) return this._discovery;

    // Read parent package.json to get package name and version
    let packageName = 'normaljs';
    let packageVersion = '1.0.0';

    try {
      // Try to find parent application package.json
      let currentDir = process.cwd();
      let found = false;

      // Search up to 5 levels
      for (let i = 0; i < 5 && !found; i++) {
        const pkgPath = path.join(currentDir, 'package.json');
        if (fs.existsSync(pkgPath)) {
          try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            // Use parent package if it's not normaljs itself
            if (pkg.name && pkg.name !== 'normaljs') {
              packageName = pkg.name;
              packageVersion = pkg.version || '1.0.0';
              found = true;
            }
          } catch {}
        }
        currentDir = path.dirname(currentDir);
      }
    } catch {}

    // Create discovery secret from connection config
    const configCopy = {
      client: this.config.client,
      connection: this.config.connection,
    };
    const secret = crypto.createHash('sha256').update(JSON.stringify(configCopy)).digest('hex');

    const discoveryOpts = {
      enabled: this._discoveryOptions.enabled !== false,
      packageName: this._discoveryOptions.packageName || packageName,
      packageVersion: this._discoveryOptions.packageVersion || packageVersion,
      secret: secret,
      connectionHashes: [this.getConnectionHash()],
      ...this._discoveryOptions,
    };

    this._discovery = new Discovery(discoveryOpts);
    return this._discovery;
  }

  /**
   * Start discovery service
   */
  async startDiscovery() {
    const discovery = this.getDiscovery();
    if (discovery.enabled) {
      await discovery.start();
    }
  }
}

module.exports = { Connection };

"use strict";
const knex = require("knex");

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
   */
  constructor(opts = {}) {
    this.config = this._buildConfig(opts);
    this._knex = null;
  }

  _buildConfig(opts) {
    const client = opts.client || process.env.DB_CLIENT || "pg";

    if (client === "pg") {
      const connection = opts.connection || {
        host: process.env.PGHOST || "localhost",
        port: +(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE || "postgres",
        user: process.env.PGUSER || "postgres",
        password: process.env.PGPASSWORD || "postgres",
        ssl: process.env.PGSSL ? { rejectUnauthorized: false } : undefined,
      };
      return {
        client: "pg",
        connection,
        pool: opts.pool || { min: 0, max: 10 },
        acquireConnectionTimeout: 15000,
      };
    }

    if (client === "sqlite3") {
      const filename =
        (opts.connection && opts.connection.filename) ||
        process.env.SQLITE_FILENAME ||
        ":memory:";
      return {
        client: "sqlite3",
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
    await kx.raw("select 1");
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
    if (this._knex) {
      await this._knex.destroy();
      this._knex = null;
    }
  }
}

module.exports = { Connection };

import knex, { Knex } from 'knex';
import { Discovery, hashString } from './cache/Discovery';
import { Cache } from './Cache';

export interface DiscoveryOptions {
  enabled?: boolean;
  packageName?: string;
  packageVersion?: string;
  secret?: string;
  connectionHash?: string;
  onMemberJoin?: (member: any) => void;
  onMemberLeave?: (member: any) => void;
  onMemberUpdate?: (member: any) => void;
  [key: string]: any;
}

export interface DiscoveryMember {
  addr: string;
  port: number;
  connections?: string[];
  [key: string]: any;
}

export interface CacheOptions {
  enabled?: boolean;
  [key: string]: any;
}
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';

export interface ConnectionConfig {
  client: string;
  connection?: any;
  pool?: {
    min: number;
    max: number;
  };
  debug?: boolean;
  useNullAsDefault?: boolean;
  acquireConnectionTimeout?: number;
}

export interface ConnectionOptions {
  client?: 'pg' | 'sqlite3' | 'mysql2' | string;
  connection?: any;
  pool?: {
    min: number;
    max: number;
  };
  debug?: boolean;
  discovery?: Partial<DiscoveryOptions>;
  cache?: Partial<CacheOptions>;
}

/**
 * Simple Knex-backed connection wrapper.
 * Supports 'pg' (default) and 'sqlite3' via env or opts.
 *
 * Env (pg):
 *  - PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
 * Env (sqlite3):
 *  - SQLITE_FILENAME
 */
export class Connection {
  public config: ConnectionConfig;
  private _knex: Knex | null = null;
  private _discovery: Discovery | null = null;
  private _discoveryOptions: Partial<DiscoveryOptions>;
  private _cache: Cache | null = null;
  private _cacheOptions: Partial<CacheOptions>;

  /**
   * @param opts Connection options
   */
  constructor(opts: ConnectionOptions = {}) {
    this.config = this._buildConfig(opts);
    this._discoveryOptions = opts.discovery || {};
    this._cacheOptions = opts.cache || {};
  }

  private _buildConfig(opts: ConnectionOptions): ConnectionConfig {
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
  get instance(): Knex {
    return this._knex || (this._knex = knex(this.config as Knex.Config));
  }

  // Ensure connectivity (simple ping)
  async connect(): Promise<Knex> {
    const kx = this.instance;
    await kx.raw('select 1');
    return kx;
  }

  // Query builder entry
  table(name: string): Knex.QueryBuilder {
    return this.instance(name);
  }

  // Raw SQL
  raw(sql: string, bindings?: any): Knex.Raw {
    return this.instance.raw(sql, bindings);
  }

  // Transaction helper
  transaction<T = any>(
    work: (trx: Knex.Transaction) => Promise<T>,
    config?: Knex.TransactionConfig
  ): Promise<T> {
    return this.instance.transaction(work, config) as Promise<T>;
  }

  // Close and cleanup
  async destroy(): Promise<void> {
    if (this._discovery) {
      this._discovery.stop();
      this._discovery = null;
    }
    if (this._cache) {
      // Stop cache timers
      if ((this._cache as any)._sweepTimer) clearInterval((this._cache as any)._sweepTimer);
      if ((this._cache as any)._metricsTimer) clearInterval((this._cache as any)._metricsTimer);
      if ((this._cache as any)._cluster) (this._cache as any)._cluster.stop();
      this._cache = null;
    }
    if (this._knex) {
      await this._knex.destroy();
      this._knex = null;
    }
  }

  /**
   * Get connection hash (used for discovery)
   */
  getConnectionHash(): string {
    const configCopy = {
      client: this.config.client,
      connection: this.config.connection,
    };
    const serialized = JSON.stringify(configCopy);
    return hashString(serialized);
  }

  /**
   * Get or create cache instance for this connection
   */
  getCache(): Cache | null {
    if (this._cache) return this._cache;

    // Check if cache is disabled
    const disabled =
      this._cacheOptions.enabled === false ||
      process.env.CACHE_DISABLED === '1' ||
      process.env.CACHE_DISABLED === 'true';
    if (disabled) return null;

    // Create cache instance for this connection
    const cacheOpts: Partial<CacheOptions> = {
      ...this._cacheOptions,
      // Discovery integration will be set up separately
    };

    this._cache = new Cache(cacheOpts);
    return this._cache;
  }

  /**
   * Get or create discovery instance
   */
  getDiscovery(): Discovery {
    if (this._discovery) return this._discovery;

    // Read parent package.json to get package name and version
    let packageName = 'normaljs';
    let packageVersion = '1.0.0';

    // Only scan filesystem if packageName is not provided in options
    if (!this._discoveryOptions.packageName) {
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
    }

    // Create discovery secret from connection config
    const configCopy = {
      client: this.config.client,
      connection: this.config.connection,
    };
    const secret = crypto.createHash('sha256').update(JSON.stringify(configCopy)).digest('hex');

    const discoveryOpts: Partial<DiscoveryOptions> = {
      enabled: this._discoveryOptions.enabled !== false,
      packageName: this._discoveryOptions.packageName || packageName,
      packageVersion: this._discoveryOptions.packageVersion || packageVersion,
      secret: secret,
      connectionHash: this.getConnectionHash(),
      ...this._discoveryOptions,
    };

    // Set up event handlers to sync discovered members with cache peers
    const originalOnMemberJoin = discoveryOpts.onMemberJoin;
    const originalOnMemberLeave = discoveryOpts.onMemberLeave;
    const originalOnMemberUpdate = discoveryOpts.onMemberUpdate;

    discoveryOpts.onMemberJoin = (member: DiscoveryMember) => {
      this._syncCachePeersFromDiscovery();
      if (originalOnMemberJoin) originalOnMemberJoin(member);
    };

    discoveryOpts.onMemberLeave = (member: DiscoveryMember) => {
      this._syncCachePeersFromDiscovery();
      if (originalOnMemberLeave) originalOnMemberLeave(member);
    };

    discoveryOpts.onMemberUpdate = (member: DiscoveryMember) => {
      this._syncCachePeersFromDiscovery();
      if (originalOnMemberUpdate) originalOnMemberUpdate(member);
    };

    this._discovery = new Discovery(discoveryOpts as DiscoveryOptions);
    return this._discovery;
  }

  /**
   * Sync cache cluster peers from discovered members
   * @private
   */
  private _syncCachePeersFromDiscovery(): void {
    if (!this._cache || !this._discovery) return;

    const members = this._discovery.getMembers() as DiscoveryMember[];
    const peers = members
      .filter((m) => {
        // Only include members with matching connection hash
        return m.connections && m.connections.includes(this.getConnectionHash());
      })
      .map((m) => ({
        host: m.addr,
        port: m.port,
      }));

    // Update cache cluster peers
    (this._cache as any).clusterPeers = peers;
    if ((this._cache as any)._cluster) {
      (this._cache as any)._cluster.peers = peers;
    }
  }

  /**
   * Start discovery service
   */
  async startDiscovery(): Promise<void> {
    const discovery = this.getDiscovery();
    if ((discovery as any).enabled) {
      await discovery.start();
      // Initial sync of cache peers
      this._syncCachePeersFromDiscovery();
    }
  }
}

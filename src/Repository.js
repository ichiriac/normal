"use strict";

/**
 * Repository: registers model definitions and exposes CRUD over Knex.
 *
 * Contract expected by demo:
 * - new Repository(connection)
 * - register(modelClassOrModule)
 * - get(name) -> model handle
 * - sync({ force }) -> create/drop tables based on static fields
 * - transaction(fn) -> run work inside a knex transaction; fn gets a tx-bound repo
 *
 * Model shape (from demo models):
 *   class Users {
 *     static name = 'Users';
 *     static table = 'users';
 *     static fields = { id: { primary:true, generated:true }, ... }
 *     // optional getters/methods on prototype
 *   }
 *
 * Relations:
 *  - field type 'collection' with foreign: 'JoinTable.left_col' denotes a many-to-many via JoinTable
 *    Example: Posts.tags -> 'TagsPosts.post_id'; Tags.posts -> 'TagsPosts.tag_id'.
 */
class Repository {
  /** @param {import('./Connection').Connection|{ instance: any }} connection */
  constructor(connection) {
    this.connection = connection;
    this.knex = connection.instance || connection;
    /** @type {Record<string, any>} */
    this.models = {};
    /** @type {Record<string, any>} */
    this.meta = {};
  }

  /** Register a model class or an extension class */
  register(modelModule) {
    const ModelClass = modelModule?.default || modelModule;
    if (typeof ModelClass !== "function") {
      const result = {};
      for (let k of Object.keys(modelModule || {})) {
        if (typeof modelModule[k] !== "function") continue;
        result[k] = this.register(modelModule[k]);
      }
      return result;
    }
    const name = ModelClass.name || ModelClass?.name;
    if (!name) throw new Error("Model class must have a name");

    const table = ModelClass.table || this._inferTable(name);
    const fields = {
      ...(this.meta[name]?.fields || {}),
      ...(ModelClass.fields || {}),
    };

    // Merge/extend existing model registration
    const meta = (this.meta[name] = {
      name,
      table,
      fields,
      cls: ModelClass,
    });

    // Build model handle API bound to knex
    this.models[name] = this._buildModelHandle(meta);
    return this.models[name];
  }

  get(name) {
    const m = this.models[name];
    if (!m) throw new Error(`Model not registered: ${name}`);
    return m;
  }

  /** Drop and create tables based on registered models */
  async sync(opts = {}) {
    const { force = false } = opts;
    const kx = this.knex.instance || this.knex;

    const ordered = this._orderTablesForSync();

    // Drop if force
    if (force) {
      for (const name of [...ordered].reverse()) {
        const { table } = this.meta[name];
        // Skip join tables until later
        await kx.schema.dropTableIfExists(table).catch(() => {});
      }
      for (const jt of this._collectJoinTables()) {
        await kx.schema.dropTableIfExists(jt.name).catch(() => {});
      }
    }

    // Create base tables
    for (const name of ordered) {
      const { table, fields } = this.meta[name];
      const exists = await kx.schema.hasTable(table);
      if (!exists) {
        await kx.schema.createTable(table, (t) =>
          this._applyColumns(t, fields)
        );
      }
    }

    // Create join tables last
    for (const jt of this._collectJoinTables()) {
      const exists = await kx.schema.hasTable(jt.name);
      if (!exists) {
        await kx.schema.createTable(jt.name, (t) => {
          // Two FK integer columns + composite primary key
          t.integer(jt.left.column).notNullable();
          t.integer(jt.right.column).notNullable();
          t.primary([jt.left.column, jt.right.column]);
        });
      }
    }
  }

  /** Run a function inside a transaction and expose a tx-bound repository */
  async transaction(work, config) {
    const kx = this.knex.instance || this.knex;
    return await kx.transaction(async (trx) => {
      const txRepo = new Repository({ instance: trx });
      // Re-register models with the same metadata
      for (const name of Object.keys(this.meta)) {
        const { cls } = this.meta[name];
        txRepo.register(cls);
      }
      return await work(txRepo);
    }, config);
  }

  // --------------------- internals ---------------------

  _inferTable(name) {
    return name.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
  }

  _applyColumns(t, fields) {
    // Primary key detection
    let hasPk = false;
    for (const [key, spec] of Object.entries(fields)) {
      if (spec?.type === "collection") continue; // relation-only
      if (spec?.primary) hasPk = true;
    }

    for (const [key, spec] of Object.entries(fields)) {
      if (spec?.type === "collection") continue;
      // Basic types mapping
      let col;
      switch (spec?.type) {
        case "number":
          col = spec.generated ? t.increments(key) : t.integer(key);
          break;
        case "boolean":
          col = t.boolean(key);
          break;
        case "datetime":
          col = t.timestamp(key, { useTz: false });
          break;
        case "string":
        default:
          col = t.string(key);
      }
      if (spec?.nullable === false) col.notNullable();
      if (spec?.unique) col.unique();
      // Defaults: allow function or value
      if (typeof spec?.default === "function") {
        // can't use JS function in SQL default; leave to application on insert
      } else if (spec?.default !== undefined) {
        col.defaultTo(spec.default);
      }
      if (spec?.primary && !spec.generated) col.primary();
      // FK: foreign: 'Users.id' (for many-to-one)
      if (spec?.foreign && spec.type !== "collection") {
        const [refModel, refCol] = String(spec.foreign).split(".");
        // Best-effort: add unsigned integer and index
        // Detailed FK constraints skipped for portability
        col.index();
      }
    }
    // Add id primary if none defined
    if (!hasPk) t.increments("id").primary();
  }

  _orderTablesForSync() {
    // Simple order: as registered
    return Object.keys(this.meta);
  }

  _collectJoinTables() {
    // Scan collection fields and stitch join definitions when both sides present
    const collections = [];
    for (const [name, meta] of Object.entries(this.meta)) {
      for (const [field, spec] of Object.entries(meta.fields || {})) {
        if (spec?.type === "collection" && spec?.foreign) {
          const [jt, col] = String(spec.foreign).split(".");
          collections.push({
            model: name,
            table: meta.table,
            field,
            join: jt,
            col,
          });
        }
      }
    }
    const result = [];
    const seen = new Set();
    for (const a of collections) {
      // If the join name corresponds to a registered model, it's likely a one-to-many via FK, not a m2m join table.
      if (this.meta[a.join]) continue;
      if (seen.has(a.join)) continue;
      const b = collections.find((x) => x.join === a.join && x !== a);
      if (!b) continue;
      // Also skip if the join name matches any registered table to avoid clobbering real tables.
      if (Object.values(this.meta).some((m) => m.table === a.join)) continue;
      seen.add(a.join);
      result.push({
        name: a.join,
        left: { table: a.table, column: a.col },
        right: { table: b.table, column: b.col },
      });
    }
    return result;
  }

  _buildModelHandle(meta) {
    const repo = this;
    const kx = this.knex.instance || this.knex;
    const { table, fields, cls } = meta;

    const handle = {
      table: () => kx(table),
      query: () => kx(table),
      async create(data) {
        const toInsert = { ...data };
        // Remove collection fields from insert
        for (const [k, spec] of Object.entries(fields)) {
          if (spec?.type === "collection") delete toInsert[k];
          if (
            spec?.type === "datetime" &&
            toInsert[k] == null &&
            typeof spec.default === "function"
          ) {
            toInsert[k] = spec.default();
          }
        }
        const [id] = await kx(table)
          .insert(toInsert)
          .returning("id")
          .catch(async (e) => {
            // SQLite fallback (returning not supported)
            await kx(table).insert(toInsert);
            const row = await kx(table).orderBy("id", "desc").first("id");
            return [row?.id];
          });
        const row = await kx(table)
          .where({ id: typeof id === "object" ? id.id : id })
          .first();
        const instance = repo._wrapInstance(cls, row, meta);

        // Handle initial many-to-many assignment via array of ids
        for (const [k, spec] of Object.entries(fields)) {
          if (spec?.type === "collection" && Array.isArray(data?.[k])) {
            const coll = instance[k];
            for (const v of data[k]) await coll.add(v);
          }
        }
        return instance;
      },
      async findById(id) {
        const row = await kx(table).where({ id }).first();
        return row ? repo._wrapInstance(cls, row, meta) : null;
      },
      where(...args) {
        return kx(table).where(...args);
      },
      async firstWhere(where) {
        const row = await kx(table).where(where).first();
        return row ? repo._wrapInstance(cls, row, meta) : null;
      },
    };
    return handle;
  }

  _wrapInstance(ModelClass, row, meta) {
    const inst = Object.assign(Object.create(ModelClass.prototype || {}), row);
    // Attach relation proxies for collection fields
    for (const [field, spec] of Object.entries(meta.fields || {})) {
      if (spec?.type !== "collection" || !spec?.foreign) continue;
      const [joinTable, leftCol] = String(spec.foreign).split(".");
      // Find the opposite definition to deduce right column
      const other = this._findOppositeCollection(joinTable, meta.name, field);
      const rightCol =
        other?.col || (leftCol === "post_id" ? "tag_id" : "other_id");

      Object.defineProperty(inst, field, {
        enumerable: false,
        configurable: false,
        get: () =>
          this._makeCollectionProxy(
            joinTable,
            leftCol,
            rightCol,
            meta.table,
            inst.id,
            other?.table
          ),
      });
    }
    return inst;
  }

  _findOppositeCollection(joinTable, modelName, fieldName) {
    for (const [name, m] of Object.entries(this.meta)) {
      if (name === modelName) continue;
      for (const [f, spec] of Object.entries(m.fields || {})) {
        if (
          spec?.type === "collection" &&
          String(spec.foreign).startsWith(joinTable + ".")
        ) {
          const [, col] = String(spec.foreign).split(".");
          return { model: name, table: m.table, field: f, col };
        }
      }
    }
    return null;
  }

  _makeCollectionProxy(
    joinTable,
    leftCol,
    rightCol,
    ownerTable,
    ownerId,
    targetTable
  ) {
    const kx = this.knex.instance || this.knex;
    const repo = this;
    return {
      async add(entityOrId) {
        const targetId =
          typeof entityOrId === "object" ? entityOrId.id : entityOrId;
        const row = {};
        row[leftCol] = ownerId;
        row[rightCol] = targetId;
        await kx(joinTable).insert(row);
      },
      async remove(entityOrId) {
        const targetId =
          typeof entityOrId === "object" ? entityOrId.id : entityOrId;
        const where = {};
        where[leftCol] = ownerId;
        where[rightCol] = targetId;
        await kx(joinTable).where(where).del();
      },
      async load() {
        // Select target rows joined through the join table
        const rows = await kx(targetTable)
          .join(joinTable, `${targetTable}.id`, `${joinTable}.${rightCol}`)
          .where(`${joinTable}.${leftCol}`, ownerId)
          .select(`${targetTable}.*`);
        // Wrap in their model class if registered
        const targetModel = Object.values(repo.meta).find(
          (m) => m.table === targetTable
        )?.cls;
        return rows.map((r) =>
          Object.assign(Object.create(targetModel?.prototype || {}), r)
        );
      },
    };
  }
}

module.exports = { Repository };

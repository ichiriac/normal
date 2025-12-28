// @ts-nocheck - TODO: Add proper type annotations
// Lightweight structural typings to aid editor tooling without changing runtime behavior.
type AnyMap = { [key: string]: any };

interface FieldLike {
  name: string;
  buildColumn: (table: any, prev?: any) => boolean | void;
  buildIndex: (table: any, prev?: any) => boolean | void;
  buildPostIndex: (prev?: any) => Promise<boolean | void>;
  getMetadata: () => any;
}

interface IndexManagerLike {
  synchronize: (cnx: ConnectionLike, prevIndexes: any[], force: boolean) => Promise<boolean>;
  getIndexes?: () => any[];
}

interface ModelLike {
  name: string;
  table: string;
  description?: string;
  fields: { [name: string]: FieldLike };
  inherits?: string | null;
  indexes?: any[];
  mixins?: any[];
  abstract?: boolean;
  indexManager: IndexManagerLike;
  _init: () => void;
}

interface SchemaApiLike {
  hasTable: (name: string) => Promise<boolean>;
  createTable: (name: string, cb: (table: any) => void) => Promise<any>;
  table: (name: string, cb: (table: any) => void) => Promise<any>;
  dropTableIfExists: (name: string) => Promise<void>;
  renameTable: (from: string, to: string) => Promise<void>;
  queryContext: (ctx: AnyMap) => SchemaApiLike;
}

interface ConnectionLike {
  schema: SchemaApiLike;
  on: (event: 'query', listener: (e: any) => void) => void;
  off?: (event: 'query', listener: (e: any) => void) => void;
  removeListener?: (event: 'query', listener: (e: any) => void) => void;
  rollback: () => Promise<void>;
}

interface TransactionLike {
  cnx: ConnectionLike;
  get: (name: string) => ModelLike;
  models: { [name: string]: ModelLike };
}

interface RepositoryLike {
  has: (name: string) => boolean;
  register: (ModelClass: any) => void;
  get: (name: string) => ModelLike;
  cnx: ConnectionLike;
  transaction: <T>(fn: (tx: TransactionLike) => Promise<T>) => Promise<T>;
  models?: { [name: string]: ModelLike };
}

interface SyncOptions {
  force?: boolean;
  dryRun?: boolean;
}
/**
 * Model to track registered models and their schema
 */
class Models {
  static _name = '$Models';
  static table = 'sys_models';
  static fields = {
    name: { type: 'string', unique: true, required: true },
    description: { type: 'string', required: false },
    table: { type: 'string', required: true, unique: true },
    fields: { type: 'json', required: true },
    inherits: { type: 'string', required: false },
    options: { type: 'json', required: false },
    created_at: { type: 'datetime', default: () => new Date() },
    updated_at: { type: 'datetime', default: () => new Date() },
    dropped_at: { type: 'datetime' },
  };

  write(data: AnyMap) {
    data.updated_at = new Date();
    return super.write(data);
  }
  static async getByName(name: string) {
    const results = await this.query().where('name', name).limit(1);
    return results[0] || null;
  }
}

// Helper: inline bindings for human-readable SQL
function inlineBindings(sql: string, bindings: any[]): string {
  if (!bindings || !bindings.length) return sql;
  let i = 0;
  return sql.replace(/\?/g, () => {
    const v = bindings[i++];
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return String(v);
    if (v instanceof Date) return `'${v.toISOString()}'`;
    const s = String(v).replace(/'/g, "''");
    return `'${s}'`;
  });
}

/**
 * Synchronize the database schema with the registered models
 * @param {*} repository
 * @param {*} options
 */
async function Synchronize(repository: RepositoryLike, options?: SyncOptions): Promise<string[]> {
  if (!repository.has('$Models')) {
    repository.register(Models);
  }
  const cnx = repository.cnx as ConnectionLike;
  const exists = await cnx.schema.hasTable(repository.get('$Models').table);
  const force = options?.force || false;

  // initialize the Models table if it doesn't exist
  if (!exists) {
    repository.get('$Models')._init();
    const modelFields = repository.get('$Models').fields;
    await cnx.schema.createTable(repository.get('$Models').table, (table) => {
      for (const field of Object.values(modelFields)) {
        field.buildColumn(table);
        field.buildIndex(table);
      }
    });
    for (const field of Object.values(modelFields)) {
      await field.buildPostIndex(null);
    }
  }

  const sql_statements: string[] = [];
  // sync the Models table schema
  await repository.transaction(async (transaction: TransactionLike) => {
    const models: { [name: string]: { schema: any; found: boolean } } = {};
    const schema = await transaction.get('$Models').query().whereNull('dropped_at');

    for (const s of schema) {
      models[s.name] = {
        schema: s,
        found: false,
      };
    }

    // intercept generated SQL statements (attach and remove to avoid listener leaks)
    const onQuery = function (e: any) {
      if (e && e.queryContext) {
        if (e.queryContext.ignore) return;
        if (e.queryContext.model) return;
      }
      sql_statements.push(inlineBindings(e.sql, e.bindings) + ';');
    };
    transaction.cnx.on('query', onQuery);

    // initialize all models
    for (const name of Object.keys(transaction.models)) {
      if (name == '$Models') continue;
      const model = transaction.models[name];
      if (model.abstract) continue;
      model._init();
    }

    // synchronize each model
    for (const name of Object.keys(transaction.models)) {
      if (name == '$Models') continue;
      const model = transaction.models[name];
      if (model.abstract) continue;

      // synchronize model table
      let changed = false;
      const schema = models[name]?.schema || null;
      sql_statements.push(`/* synchronizing model: ${name} */`);
      const hasTable = await transaction.cnx.schema
        .queryContext({ ignore: true })
        .hasTable(model.table);
      if (force) {
        await transaction.cnx.schema.dropTableIfExists(model.table);
      }

      if (!schema || force) {
        changed = true;
      } else {
        if (model.table !== schema.table) {
          await transaction.cnx.schema.renameTable(model.table, schema.table);
          changed = true;
        }
      }
      const method = hasTable && !force ? 'table' : 'createTable';
      const fields: AnyMap = {};
      // synchronize fields
      await transaction.cnx.schema[method](model.table, (table) => {
        if (model.description) {
          table.comment(model.description);
        }
        for (const field of Object.values(model.fields) as FieldLike[]) {
          const colChange = field.buildColumn(
            table,
            schema && !force ? schema.fields[field.name] : null
          );
          const indexChange = field.buildIndex(
            table,
            schema && !force ? schema.fields[field.name] : null
          );
          if (colChange || indexChange) {
            changed = true;
          }
          fields[field.name] = field.getMetadata();
        }
      });
      for (const field of Object.values(model.fields) as FieldLike[]) {
        const postIndexChange = await field.buildPostIndex(
          schema && !force ? schema.fields[field.name] : null
        );
        if (postIndexChange) {
          changed = true;
        }
      }

      // Synchronize model-level indexes
      const prevIndexes = schema && !force ? schema.options?.indexes || [] : [];
      const indexChange = await model.indexManager.synchronize(transaction.cnx, prevIndexes, force);
      if (indexChange) {
        changed = true;
      }

      // if anything changed, update the schema record
      if (changed) {
        const data: AnyMap = {
          name: name,
          description: model.description || '',
          table: model.table,
          fields: fields,
          inherits: model.inherits || null,
          options: {
            mixins: model.mixins || [],
            indexes: model.indexes || [],
          },
        };
        if (schema) {
          await schema.write(data);
        } else {
          await transaction.get('$Models').create(data);
        }
      }
      if (models[name]) {
        models[name].found = true;
      }
    }

    // drop undefined tables
    for (const info of Object.values(models)) {
      if (info.found) continue;
      await transaction.cnx.schema.dropTableIfExists(info.schema.table);
      await info.schema.write({ dropped_at: new Date() });
    }

    // handle dry run rollback
    if (options?.dryRun) {
      await transaction.cnx.rollback();
    }
    // ensure we detach the temporary query listener
    if (typeof transaction.cnx.off === 'function') {
      transaction.cnx.off('query', onQuery);
    } else if (typeof transaction.cnx.removeListener === 'function') {
      transaction.cnx.removeListener('query', onQuery);
    }
  });
  sql_statements.pop(); // remove the ROLLBACK or COMMIT statement
  return sql_statements;
}

export { Models, Synchronize };

import type { Model } from './Model.js';

type AnyMap = Record<string, any>;

type QueryStatement = { grouping?: string; value?: any } & AnyMap;

interface QueryBuilderLike {
  _method?: string;
  _statements?: QueryStatement[];
  _cacheTTL?: number | null;
  _includeRelations?: Set<string>;
  select?: (...args: any[]) => any;
  distinct?: (...args: any[]) => any;
  leftJoin?: (...args: any[]) => any;
  where?: (...args: any[]) => any;
  queryContext?: (ctx: AnyMap) => any;
  then: (onFulfilled?: (value: any) => any, onRejected?: (reason: any) => any) => Promise<any>;
  finally: (onFinally?: () => void) => any;
  toString: () => string;
  toSQL: (...args: any[]) => any;
}

class Request {
  protected model: Model;
  protected queryBuilder: QueryBuilderLike;

  constructor(model: Model, queryBuilder: QueryBuilderLike) {
    this.model = model;
    this.queryBuilder = queryBuilder;

    return new Proxy(this, {
      get: (target: Request, prop: PropertyKey, receiver: any) => {
        if (prop === 'model' || prop === 'queryBuilder') {
          return (target as any)[prop];
        }

        if (prop in (target as any)) {
          return Reflect.get(target as any, prop, receiver);
        }

        const value = (target.queryBuilder as any)[prop];

        if (typeof value === 'function') {
          return (...args: any[]) => {
            const result = value.apply(target.queryBuilder, args);
            if (result === target.queryBuilder) {
              return receiver;
            }
            return result;
          };
        }

        return value;
      },
    });
  }

  then(onFulfilled?: (value: any) => any, onRejected?: (reason: any) => any): Promise<any> {
    const wrap = this._shouldWrapResults();
    const cache = this.model.cache;
    if (wrap && cache && this.queryBuilder._cacheTTL != null) {
      const modelEvictTs =
        this.model._cacheInvalidateMs || cache.get('$' + this.model.name) || null;
      const item = cache.get(this._getRequestKey(), modelEvictTs || undefined);
      if (item) {
        return this._wrapResult(item).then(onFulfilled, onRejected);
      }
    }
    this._ensureDefaultIdSelect();
    return this.queryBuilder.then((value: any) => {
      if (!wrap) {
        return onFulfilled ? onFulfilled(value) : value;
      }
      if (cache && this.queryBuilder._cacheTTL != null) {
        const ttlSec = Math.max(1, this.queryBuilder._cacheTTL);
        cache.set(this._getRequestKey(), value, ttlSec);
      }
      return this._wrapResult(value).then((wrapped: any) => {
        if (onFulfilled) {
          return onFulfilled(wrapped);
        }
        return wrapped;
      });
    }, onRejected);
  }

  catch(onRejected?: (reason: any) => any): Promise<any> {
    return this.then(undefined, onRejected);
  }

  finally(onFinally?: () => void): any {
    return this.queryBuilder.finally(onFinally);
  }

  toString(): string {
    return this.queryBuilder.toString();
  }

  toSQL(...args: any[]): any {
    return this.queryBuilder.toSQL(...args);
  }

  /**
   * Enables caching for this request with the specified TTL (in seconds).
   * @param {number} ttl - Time to live in seconds.
   * @returns {Request} The current Request instance for chaining.
   */
  cache(ttl: number = 5): this {
    this.queryBuilder._cacheTTL = ttl;
    return this;
  }

  /**
   * Includes related models in the query results.
   * @param {string|string[]} relations - The relation(s) to include.
   * @returns {Request} The current Request instance for chaining.
   */
  include(relations: string | string[]): this {
    if (!this.queryBuilder._includeRelations) {
      this.queryBuilder._includeRelations = new Set();
    }
    if (!Array.isArray(relations)) {
      relations = [relations];
    }
    for (const rel of relations) {
      this.queryBuilder._includeRelations.add(rel);
    }
    return this;
  }

  protected _shouldWrapResults(): boolean {
    const method = this.queryBuilder && this.queryBuilder._method;
    // Default to wrapping unless it's clearly a write operation
    if (!method) return true;
    const m = String(method).toLowerCase();
    if (m === 'insert' || m === 'update' || m === 'upsert' || m === 'del' || m === 'delete')
      return false;
    return true;
  }

  protected _getRequestKey(): string | undefined {
    const qb = this.queryBuilder;
    if (!qb) return;
    const stmts = Array.isArray(qb._statements) ? qb._statements : [];
    const key = JSON.stringify(stmts);
    return this.model.name + ':' + key;
  }

  protected _ensureDefaultIdSelect(): void {
    const qb = this.queryBuilder;
    if (!qb) return;
    const method = qb._method;
    // Only apply to read-like queries (avoid insert/update/delete)
    const readLike = !method || method === 'select' || method === 'first';
    if (!readLike) return;
    // For inherited models, ensure join with parent table once
    // if (this.model && this.model.inherits && !qb._inheritJoined) {
    //    const parent = this.model.repo.get(this.model.inherits);
    //    if (typeof qb.leftJoin === 'function') {
    //        qb.leftJoin(parent.table, `${parent.table}.id`, `${this.model.table}.id`);
    //        qb._inheritJoined = true;
    //    }
    // }
    // Skip if select already specified or select() not available
    if (typeof qb.select !== 'function') return;
    const stmts = Array.isArray(qb._statements) ? qb._statements : [];
    const hasColumns = stmts.some(
      (s) => s && s.grouping === 'columns' && Array.isArray(s.value) && s.value.length > 0
    );
    if (hasColumns) return;

    // Check if joins are present - if so, qualify all column names and use distinct
    const hasJoins = stmts.some((s) => s && s.grouping === 'join');

    if (this.model.cache) {
      const id = this.model.primaryField?.column || 'id';
      qb.select(`${this.model.table}.${id}`);
      // Use distinct when joins are present to avoid duplicate rows
      if (hasJoins && qb.distinct) {
        qb.distinct();
      }
    } else {
      // Qualify columns with table name if joins are present
      if (hasJoins && qb.distinct) {
        const qualifiedColumns = this.model.columns.map((col) => `${this.model.table}.${col}`);
        qb.distinct().select(qualifiedColumns);
      } else {
        qb.select(this.model.columns);
      }
    }
  }

  protected _wrapResult(value: any): Promise<any> {
    const wrapRow = (row: any) => {
      if (!this._isWrappableRow(row)) {
        return Promise.resolve(row);
      }
      const allocated = this.model.allocate(row);
      if (allocated && typeof allocated.ready === 'function') {
        return allocated.ready();
      }
      return Promise.resolve(allocated);
    };

    if (Array.isArray(value)) {
      if (this.queryBuilder._includeRelations && this.queryBuilder._includeRelations.size > 0) {
        const includeRelations = Array.from(this.queryBuilder._includeRelations);
        const loadIncludes = async (rows: any[], relations: string[]) => {
          const loaders = [];
          for (const relationName of relations) {
            const relation = (this.model as any).fields[relationName];
            if (!relation) {
              throw new Error(`Relation '${relationName}' not found on model '${this.model.name}'`);
            }
            loaders.push(relation.loadForRows(rows));
          }
          return await Promise.all(loaders);
        };
        return Promise.resolve(value.map(wrapRow)).then((wrappedRows) => {
          return loadIncludes(wrappedRows, includeRelations).then(() => wrappedRows);
        });
      }
      return Promise.all(value.map(wrapRow));
    }
    return wrapRow(value);
  }

  protected _isWrappableRow(row: any): boolean {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return false;
    }
    if (this.model && (this.model as any).cls && row instanceof (this.model as any).cls) {
      return false;
    }
    const fields = Object.keys((this.model as any)?.fields || {});
    if (fields.length === 0) {
      return true;
    }
    return fields.some((field) => Object.prototype.hasOwnProperty.call(row, field));
  }
}

export { Request };

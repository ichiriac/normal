// @ts-nocheck - TODO: Add proper type annotations
import * as crypto from 'crypto';

/**
 * IndexManager - Manages index definitions for models
 *
 * Responsibilities (SRP):
 * - Parse and merge index definitions from model classes
 * - Validate index configurations
 * - Resolve field names to column names
 * - Deploy and synchronize indexes with the database
 */

/**
 * IndexManager handles all index-related operations for a model
 */
class IndexManager {
  /**
   * @param {import('./Model').Model} model - The model instance
   */
  constructor(model) {
    this.model = model;
    this.indexes = [];
  }

  /**
   * Merge index definitions from a mixin class.
   * @param {Array|Object} indexes - Index definitions to merge
   */
  merge(indexes) {
    if (Array.isArray(indexes)) {
      // Simple array syntax: ['field1', 'field2'] or [['field1', 'field2']]
      indexes.forEach((indexDef) => {
        if (typeof indexDef === 'string') {
          this.indexes.push({
            name: `idx_${this.model.table}_${indexDef}`,
            fields: [indexDef],
          });
        } else if (Array.isArray(indexDef)) {
          this.indexes.push({
            name: `idx_${this.model.table}_${indexDef.join('_')}`,
            fields: indexDef,
          });
        }
      });
    } else if (typeof indexes === 'object') {
      // Object syntax: { idx_name: { fields: [...], unique: true } }
      for (const [name, definition] of Object.entries(indexes)) {
        const indexConfig = {
          name,
          fields: definition.fields || [],
          unique: definition.unique || false,
          type: definition.type || null,
          storage: definition.storage || null,
          predicate: definition.predicate || null,
          deferrable: definition.deferrable || null,
          useConstraint: definition.useConstraint || false,
        };
        this.indexes.push(indexConfig);
      }
    }
  }

  /**
   * Validate index definitions and resolve field names to column names.
   * Called after model fields are initialized.
   */
  validate() {
    for (const index of this.indexes) {
      if (!index.fields || index.fields.length === 0) {
        throw new Error(
          `Index '${index.name}' in model '${this.model.name}' must have at least one field`
        );
      }

      // Validate and resolve field names to column names
      index.columns = [];
      for (const fieldName of index.fields) {
        if (!this.model.fields[fieldName]) {
          throw new Error(
            `Index '${index.name}' in model '${this.model.name}' references non-existent field '${fieldName}'`
          );
        }
        const field = this.model.fields[fieldName];
        if (!field.stored) {
          throw new Error(
            `Index '${index.name}' in model '${this.model.name}' references non-stored (computed) field '${fieldName}'`
          );
        }
        index.columns.push(field.column);
      }

      // Validate storage option (FULLTEXT) is only used without unique
      if (index.storage === 'FULLTEXT' && index.unique) {
        throw new Error(
          `Index '${index.name}' in model '${this.model.name}' cannot use FULLTEXT storage with unique constraint`
        );
      }

      // Normalize index name to fit database limits (usually 63 chars for PostgreSQL)
      if (index.name.length > 60) {
        const hash = crypto
          .createHash('md5')
          .update(index.name)
          .digest('hex')
          .substring(0, 8);
        index.name = index.name.substring(0, 51) + '_' + hash;
      }
    }
  }

  /**
   * Get all indexes for this model
   * @returns {Array} Array of index definitions
   */
  getIndexes() {
    return this.indexes;
  }

  /**
   * Build WHERE clause for partial index from predicate object
   * @param {*} knex - Knex connection
   * @param {Object} predicate - Predicate object with filtering conditions
   * @returns {string|null} SQL WHERE clause or null
   */
  static buildPredicate(knex, predicate) {
    if (!predicate || typeof predicate !== 'object') return null;

    const conditions = [];
    for (const [field, condition] of Object.entries(predicate)) {
      if (condition && typeof condition === 'object') {
        if (condition.notNull) {
          conditions.push(`${knex.ref(field)} IS NOT NULL`);
        } else if (condition.isNull) {
          conditions.push(`${knex.ref(field)} IS NULL`);
        } else if (condition.eq !== undefined) {
          conditions.push(`${knex.ref(field)} = ${knex.raw('?', [condition.eq])}`);
        } else if (condition.ne !== undefined) {
          conditions.push(`${knex.ref(field)} != ${knex.raw('?', [condition.ne])}`);
        } else if (condition.gt !== undefined) {
          conditions.push(`${knex.ref(field)} > ${knex.raw('?', [condition.gt])}`);
        } else if (condition.gte !== undefined) {
          conditions.push(`${knex.ref(field)} >= ${knex.raw('?', [condition.gte])}`);
        } else if (condition.lt !== undefined) {
          conditions.push(`${knex.ref(field)} < ${knex.raw('?', [condition.lt])}`);
        } else if (condition.lte !== undefined) {
          conditions.push(`${knex.ref(field)} <= ${knex.raw('?', [condition.lte])}`);
        }
      }
    }

    return conditions.length > 0 ? conditions.join(' AND ') : null;
  }

  /**
   * Synchronize indexes with the database
   * @param {*} cnx - Knex connection
   * @param {Array} prevIndexes - Previous index definitions from schema
   * @param {boolean} force - Force recreate all indexes
   * @returns {Promise<boolean>} Whether indexes changed
   */
  async synchronize(cnx, prevIndexes, force) {
    let changed = false;
    const currentIndexes = this.indexes;

    // Get database client type
    const client = cnx.client.config.client;

    // If forcing, drop all previous indexes first
    if (force && prevIndexes.length > 0) {
      for (const prevIndex of prevIndexes) {
        try {
          await this._dropIndex(cnx, prevIndex);
        } catch (err) {
          // Index might not exist, continue
        }
      }
    }

    // Create/update current indexes
    for (const index of currentIndexes) {
      const prevIndex = prevIndexes.find((p) => p.name === index.name);

      // Check if index definition changed
      const indexChanged =
        !prevIndex ||
        JSON.stringify(prevIndex.fields) !== JSON.stringify(index.fields) ||
        prevIndex.unique !== index.unique ||
        prevIndex.type !== index.type ||
        prevIndex.storage !== index.storage ||
        JSON.stringify(prevIndex.predicate) !== JSON.stringify(index.predicate);

      if (force || indexChanged) {
        // Drop old index if it exists
        if (prevIndex && indexChanged) {
          try {
            await this._dropIndex(cnx, prevIndex);
          } catch (err) {
            // Index might not exist, continue
          }
        }

        // Create new index
        try {
          await this._createIndex(cnx, index, client);
          changed = true;
        } catch (err) {
          if (err.message && err.message.includes('unique')) {
            console.error(
              `Error: Unique constraint violation while creating index '${index.name}' on model '${this.model.name}': ${err.message}`
            );
            console.error(`Continuing migration despite error...`);
          } else {
            throw err;
          }
        }
      }
    }

    // Drop indexes that no longer exist in current definition
    if (!force) {
      for (const prevIndex of prevIndexes) {
        if (!currentIndexes.find((c) => c.name === prevIndex.name)) {
          try {
            await this._dropIndex(cnx, prevIndex);
            changed = true;
          } catch (err) {
            // Index might not exist, continue
          }
        }
      }
    }

    return changed;
  }

  /**
   * Drop an index from the database
   * @private
   * @param {*} cnx - Knex connection
   * @param {Object} index - Index definition
   */
  async _dropIndex(cnx, index) {
    if (index.unique && index.useConstraint) {
      await cnx.schema.table(this.model.table, (table) => {
        table.dropUnique(index.columns || index.fields, index.name);
      });
    } else {
      await cnx.schema.table(this.model.table, (table) => {
        table.dropIndex(index.columns || index.fields, index.name);
      });
    }
  }

  /**
   * Create an index in the database
   * @private
   * @param {*} cnx - Knex connection
   * @param {Object} index - Index definition
   * @param {string} client - Database client type
   */
  async _createIndex(cnx, index, client) {
    if (index.unique && index.useConstraint) {
      // Create unique constraint
      await cnx.schema.table(this.model.table, (table) => {
        const constraint = table.unique(index.columns, {
          indexName: index.name,
          deferrable: index.deferrable,
        });
        if (index.deferrable === 'deferred') {
          constraint.deferrable('deferred');
        } else if (index.deferrable === 'immediate') {
          constraint.deferrable('immediate');
        }
      });
    } else {
      // Create index (unique or regular)
      const hasPartialIndexSupport = ['postgresql', 'pg', 'sqlite3'].includes(client);
      const predicateClause = index.predicate
        ? IndexManager.buildPredicate(cnx, index.predicate)
        : null;

      if (predicateClause && !hasPartialIndexSupport) {
        console.warn(
          `Warning: Partial indexes not supported for ${client}, ignoring predicate on index '${index.name}' in model '${this.model.name}'`
        );
      }

      // Check if FULLTEXT is supported
      if (index.storage === 'FULLTEXT' && !['mysql', 'mysql2', 'mariadb'].includes(client)) {
        console.warn(
          `Warning: FULLTEXT storage not supported for ${client}, using regular index for '${index.name}' in model '${this.model.name}'`
        );
      }

      // For partial indexes, use raw SQL directly
      const isPartialIndex = predicateClause && hasPartialIndexSupport;

      if (isPartialIndex) {
        // Use raw SQL for partial indexes with WHERE clause
        const indexTypeClause = index.type ? ` USING ${index.type}` : '';
        const uniqueClause = index.unique ? 'UNIQUE ' : '';
        const columnList = index.columns.map((col) => `"${col}"`).join(', ');

        await cnx.raw(
          `CREATE ${uniqueClause}INDEX IF NOT EXISTS "${index.name}" ON "${this.model.table}"${indexTypeClause} (${columnList}) WHERE ${predicateClause}`
        );
      } else {
        // Use standard Knex schema builder for non-partial indexes
        await cnx.schema.table(this.model.table, (table) => {
          if (index.unique) {
            table.unique(index.columns, { indexName: index.name });
          } else {
            table.index(index.columns, index.name, {
              indexType: index.type || undefined,
              storageEngineIndexType: index.storage || undefined,
            });
          }
        });
      }
    }
  }
}

export { IndexManager };

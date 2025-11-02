/**
 * Model to track registered models and their schema
 */
class Models {
  static name = '$Models';
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

  write(data) {
    data.updated_at = new Date();
    return super.write(data);
  }
  static async getByName(name) {
    const results = await this.query().where('name', name).limit(1);
    return results[0] || null;
  }
}

// Helper: inline bindings for human-readable SQL
function inlineBindings(sql, bindings) {
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
 * Build WHERE clause for partial index from predicate object
 * @param {*} knex
 * @param {*} predicate
 * @returns {string|null}
 */
function buildIndexPredicate(knex, predicate) {
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
 * Synchronize model-level indexes
 * @param {*} cnx Knex connection
 * @param {*} model Model instance
 * @param {*} prevIndexes Previous index definitions from schema
 * @param {*} force Force recreate all indexes
 * @returns {boolean} Whether indexes changed
 */
async function synchronizeIndexes(cnx, model, prevIndexes, force) {
  let changed = false;
  const currentIndexes = model.indexes || [];

  // Get database client type
  const client = cnx.client.config.client;

  // If forcing, drop all previous indexes first
  if (force && prevIndexes.length > 0) {
    for (const prevIndex of prevIndexes) {
      try {
        if (prevIndex.unique && prevIndex.useConstraint) {
          await cnx.schema.table(model.table, (table) => {
            table.dropUnique(prevIndex.columns || prevIndex.fields, prevIndex.name);
          });
        } else {
          await cnx.schema.table(model.table, (table) => {
            table.dropIndex(prevIndex.columns || prevIndex.fields, prevIndex.name);
          });
        }
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
          if (prevIndex.unique && prevIndex.useConstraint) {
            await cnx.schema.table(model.table, (table) => {
              table.dropUnique(prevIndex.columns || prevIndex.fields, prevIndex.name);
            });
          } else {
            await cnx.schema.table(model.table, (table) => {
              table.dropIndex(prevIndex.columns || prevIndex.fields, prevIndex.name);
            });
          }
        } catch (err) {
          // Index might not exist, continue
        }
      }

      // Create new index
      try {
        if (index.unique && index.useConstraint) {
          // Create unique constraint
          await cnx.schema.table(model.table, (table) => {
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
            ? buildIndexPredicate(cnx, index.predicate)
            : null;

          if (predicateClause && !hasPartialIndexSupport) {
            console.warn(
              `Warning: Partial indexes not supported for ${client}, ignoring predicate on index '${index.name}' in model '${model.name}'`
            );
          }

          // Check if FULLTEXT is supported
          if (index.storage === 'FULLTEXT' && !['mysql', 'mysql2', 'mariadb'].includes(client)) {
            console.warn(
              `Warning: FULLTEXT storage not supported for ${client}, using regular index for '${index.name}' in model '${model.name}'`
            );
          }

          await cnx.schema.table(model.table, (table) => {
            if (index.unique) {
              table.unique(index.columns, { indexName: index.name });
            } else {
              const indexBuilder = table.index(index.columns, index.name, {
                indexType: index.type || undefined,
                storageEngineIndexType: index.storage || undefined,
              });

              // Add WHERE clause for partial indexes
              if (predicateClause && hasPartialIndexSupport) {
                // Use raw SQL for partial index with WHERE clause
                // Note: Knex doesn't have native support for WHERE in index(), so we use raw
                // Drop the index that was just created and recreate with WHERE
                table.dropIndex(index.columns, index.name);
              }
              // Silence unused variable warning
              void indexBuilder;
            }
          });

          // For partial indexes, we need to use raw SQL
          if (predicateClause && hasPartialIndexSupport) {
            const indexTypeClause = index.type ? ` USING ${index.type}` : '';
            const uniqueClause = index.unique ? 'UNIQUE ' : '';
            const columnList = index.columns.map((col) => `"${col}"`).join(', ');

            await cnx.raw(
              `CREATE ${uniqueClause}INDEX IF NOT EXISTS "${index.name}" ON "${model.table}"${indexTypeClause} (${columnList}) WHERE ${predicateClause}`
            );
          }
        }
        changed = true;
      } catch (err) {
        if (err.message && err.message.includes('unique')) {
          console.error(
            `Error: Unique constraint violation while creating index '${index.name}' on model '${model.name}': ${err.message}`
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
          if (prevIndex.unique && prevIndex.useConstraint) {
            await cnx.schema.table(model.table, (table) => {
              table.dropUnique(prevIndex.columns || prevIndex.fields, prevIndex.name);
            });
          } else {
            await cnx.schema.table(model.table, (table) => {
              table.dropIndex(prevIndex.columns || prevIndex.fields, prevIndex.name);
            });
          }
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
 * Synchronize the database schema with the registered models
 * @param {*} repository
 * @param {*} options
 */
async function Synchronize(repository, options) {
  if (!repository.has('$Models')) {
    repository.register(Models);
  }
  const cnx = repository.cnx;
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

  const sql_statements = [];
  // sync the Models table schema
  await repository.transaction(async (transaction) => {
    const models = {};
    const schema = await transaction.get('$Models').query().whereNull('dropped_at');

    for (const s of schema) {
      models[s.name] = {
        schema: s,
        found: false,
      };
    }

    // intercept generated SQL statements
    transaction.cnx.on('query', function (e) {
      if (e.queryContext) {
        if (e.queryContext.ignore) return;
        if (e.queryContext.model) return;
      }
      sql_statements.push(inlineBindings(e.sql, e.bindings) + ';');
    });

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
      const fields = {};
      // synchronize fields
      await transaction.cnx.schema[method](model.table, (table) => {
        if (model.description) {
          table.comment(model.description);
        }
        for (const field of Object.values(model.fields)) {
          let colChange = field.buildColumn(
            table,
            schema && !force ? schema.fields[field.name] : null
          );
          let indexChange = field.buildIndex(
            table,
            schema && !force ? schema.fields[field.name] : null
          );
          if (colChange || indexChange) {
            changed = true;
          }
          fields[field.name] = field.getMetadata();
        }
      });
      for (const field of Object.values(model.fields)) {
        let postIndexChange = await field.buildPostIndex(
          schema && !force ? schema.fields[field.name] : null
        );
        if (postIndexChange) {
          changed = true;
        }
      }

      // Synchronize model-level indexes
      const prevIndexes = schema && !force ? schema.options?.indexes || [] : [];
      const indexChange = await synchronizeIndexes(transaction.cnx, model, prevIndexes, force);
      if (indexChange) {
        changed = true;
      }

      // if anything changed, update the schema record
      if (changed) {
        const data = {
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
  });
  sql_statements.pop(); // remove the ROLLBACK or COMMIT statement
  return sql_statements;
}

module.exports = {
  Models,
  Synchronize,
};

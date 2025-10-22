
/**
 * Model to track registered models and their schema
 */
class Models {
    static name = 'Models';
    static table = 'sys_models';
    static fields = {
        name: { type: 'string', unique: true, required: true },
        table: { type: 'string', required: true, unique: true },
        fields: { type: 'json', required: true },
        inherits: { type: 'string', required: false },
        options: { type: 'json', required: false },
        created_at: { type: 'datetime', default: () => new Date() },
        updated_at: { type: 'datetime', default: () => new Date() },
        dropped_at: { type: 'datetime' }
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

/**
 * Synchronize the database schema with the registered models
 * @param {*} repository 
 * @param {*} options 
 */
async function Synchronize(repository, options) {
    if (!repository.has('Models')) {
        repository.register(Models);
    }
    const cnx = repository.cnx;
    const exists = await cnx.schema.hasTable(repository.get('Models').table);
    const force = options?.force || false;

    // initialize the Models table if it doesn't exist
    if (!exists) {
        repository.get('Models')._init();
        await cnx.schema.createTable(repository.get('Models').table,  (table) => {
            const modelFields = repository.get('Models').fields;
            for (const field of Object.values(modelFields)) {
                 field.buildColumn(table);
                 field.buildIndex(table);
            }
        });
    }

    // intercept generated SQL statements
    const originalToSQL = cnx.schema.toSQL;
    const sql_statements = [];
    cnx.schema.toSQL = function () {
        const sql = originalToSQL.apply(this, arguments);
        sql_statements.push(sql);
        return sql;
    };

    // sync the Models table schema
    await repository.transaction(async (transaction) => {
        const models = {};

        const schema = await transaction.get('Models').query().whereNull('dropped_at');

        for(const s of schema) {
            models[s.name] = {
                schema: s,
                found: false,
            };
        }

        for (const name of Object.keys(transaction.models)) {
            if (name == 'Models') continue;
            const model = transaction.models[name];
            if (model.abstract) continue;

            // synchronize model table
            let changed = false;
            const schema = models[name]?.schema || null;
            const hasTable = await transaction.cnx.schema.hasTable(model.table);
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

            const method = hasTable ? 'table' : 'createTable';
            // synchronize fields
            await transaction.cnx.schema[method](model.table, async (table) => {
                for (const field of Object.values(model.fields)) {
                    changed ||= await field.buildColumn(table, schema && !force ? schema.fields[field.name] : null);
                }
            });
            models[name].changed = changed;
            models[name].entity = model;
            models[name].found = true;
        }
        // create indexes and relationships
        for (const name of Object.keys(models)) {
            const model = models[name];
            const fields = {};
            await transaction.cnx.schema.alterTable(model.entity.table, async (table) => {
                for (const field of Object.values(model.entity.fields)) {
                    fields[field.name] = field.getMetadata();
                    model.changed ||= await field.buildIndex(table, schema && !force ? model.schema.fields[field.name] : null);
                }
            });
            // if anything changed, update the schema record
            if (model.changed) {
                const data = {
                    name: name,
                    table: model.entity.table,
                    fields: fields,
                    inherits: model.entity.inherits || null,
                    options: {
                        mixins: model.entity.mixins || [],
                        indexes: model.entity.indexes || [],
                    }
                };
                if (model.entity) {
                    await model.schema.write(data);
                } else {
                    await transaction.get('Models').create(data);
                }
            }
        }

        // drop undefined tables


        // handle dry run rollback
        if (options?.dryRun) {
            transaction.rollback();
        }
    });

    return sql_statements;
}

module.exports = {
    Models,
    Synchronize
};
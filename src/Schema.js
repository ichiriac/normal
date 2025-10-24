
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
        const modelFields = repository.get('Models').fields;
        await cnx.schema.createTable(repository.get('Models').table, (table) => {
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
        const schema = await transaction.get('Models').query().whereNull('dropped_at');

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
            sql_statements.push(
                inlineBindings(e.sql, e.bindings) + ';'
            );
        });


        // initialize all models
        for (const name of Object.keys(transaction.models)) {
            if (name == 'Models') continue;
            const model = transaction.models[name];
            if (model.abstract) continue;
            model._init();
        }

        // synchronize each model
        for (const name of Object.keys(transaction.models)) {
            if (name == 'Models') continue;
            const model = transaction.models[name];
            if (model.abstract) continue;

            // synchronize model table
            let changed = false;
            const schema = models[name]?.schema || null;
            sql_statements.push(`/* synchronizing model: ${name} */`);
            const hasTable = await transaction.cnx.schema.queryContext({ ignore: true }).hasTable(model.table);
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
                for (const field of Object.values(model.fields)) {
                    let colChange = field.buildColumn(table, schema && !force ? schema.fields[field.name] : null);
                    let indexChange = field.buildIndex(table, schema && !force ? schema.fields[field.name] : null);
                    if (colChange || indexChange) {
                        changed = true;
                    }
                    fields[field.name] = field.getMetadata();
                }
            });
            for (const field of Object.values(model.fields)) {
                let postIndexChange = await field.buildPostIndex(schema && !force ? schema.fields[field.name] : null);
                if (postIndexChange) {
                    changed = true;
                }
            }
            // if anything changed, update the schema record
            if (changed) {
                const data = {
                    name: name,
                    table: model.table,
                    fields: fields,
                    inherits: model.inherits || null,
                    options: {
                        mixins: model.mixins || [],
                        indexes: model.indexes || [],
                    }
                };
                if (schema) {
                    await schema.write(data);
                } else {
                    await transaction.get('Models').create(data);
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
    Synchronize
};
const { TableBuilder } = require("knex");

class Models {
    static name = 'Models';
    static table = 'models';
    static fields = {
        name: { type: 'string', unique: true, required: true },
        table: { type: 'string', required: true, unique: true },
        fields: { type: 'json', required: true },
        inherits: { type: 'string', required: false },
        mixins: { type: 'json', required: false },
        indexes: { type: 'json', required: false },
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

module.exports = async function synchronize(repository) {
    repository.register(Models);
    const cnx = repository.cnx;
    const exists = await cnx.schema.hasTable(repository.get('Models').table);

    // initialize the Models table if it doesn't exist
    if (!exists) {
        repository.get('Models')._init();
        await cnx.schema.createTable(repository.get('Models').table, (table) => {
            for (const fieldName of Object.keys(repository.get('Models').fields)) {
                const field = repository.get('Models').fields[fieldName];
                field.column(table);
            }
        });
    }

    // sync the Models table schema
    await repository.transaction(async (transaction) => {
        const models = {};
        for (const name of Object.keys(transaction.models)) {
            if (name == 'Models') continue;
            const model = transaction.models[name];
            if (model.abstract) continue;

            // synchronize model table
            let changed = false;
            const schema = await transaction.get('Models').getByName(name);
            const table = await transaction.cnx.schema.table(model.table);
            

            // synchronize fields
            for (const field of Object.values(model.fields)) {
                changed ||= await field.buildColumn(table, schema ? schema.fields[field.name] : null);
            }
            models[name] = { schema, table, fields: model.fields, changed, entity: model };

        }
        // create indexes and relationships
        for (const name of Object.keys(models)) {
            const model = models[name];
            const fields = {};
            for (const field of Object.values(model.fields)) {
                fields[field.name] = field.getMetadata();
                model.changed ||= await field.buildIndex(model.table, model.schema);
            }

            // if anything changed, update the schema record
            if (model.changed) {
                await model.schema.write({
                    name: name,
                    table: model.table,
                    fields: fields,
                    inherits: model.entity.inherits || null,
                    mixins: model.entity.mixins || [],
                    indexes: model.entity.indexes || [],
                });
            }
        }
    });

}
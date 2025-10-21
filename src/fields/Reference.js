const { Field } = require('./Base');

/**
 * Reference field type.
 * @extends Field
 */
class Reference extends Field {

    constructor(model, name, definition) {
        super(model, name, definition);
        this.id_field = definition.id_field || 'id';
        this.models = definition.models || [];
    }

    write(record, value) {
        return super.write(record, value);
    }

    read(record) {
        return super.read(record);
    }

    getMetadata() {
        const meta = super.getMetadata();
        meta.id_field = this.definition.id_field;
        meta.models = this.definition.models;
        return meta;
    }

    async buildIndex(table, metadata) {
        let changed =await super.buildColumn(table, metadata, () => {
            if (this.models.length > 0) {
                return table.enum(this.name, this.models);
            } else {
                return table.string(this.name);
            }
        });
        return await super.buildIndex(table, metadata) || changed;
    }
}

Field.behaviors.reference = Reference;
module.exports = { Reference };
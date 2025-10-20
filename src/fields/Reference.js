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

    async onIndex(table) {
        if (this.models.length > 0) {
            table.enum(this.name, this.models);
        } else {
            table.string(this.name);
        }
        super.onIndex(table);
    }
}

Field.behaviors.reference = Reference;
Field.behaviors.ref = Reference;
module.exports = { Reference };
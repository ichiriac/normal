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

    getColumnDefinition() {
        return null;
    }

    async buildPostIndex(metadata) {
         // inject creation behavior
        this.getColumnDefinition = (table) => {
            if (this.models.length > 0) {
                return table.enum(this.name, this.models);
            } else {
                return table.string(this.name);
            }
        };
        let changed = false;
        await this.cnx.schema.table(this.table, (table) => {
            changed = this.buildColumn(table, metadata);
            let indexChange = this.buildIndex(table, metadata);
            if (indexChange) {
                changed = true;
            }
        })
        this.getColumnDefinition = () => {
            return null;
        };
        return changed;
    }
}

Field.behaviors.reference = Reference;
module.exports = { Reference };
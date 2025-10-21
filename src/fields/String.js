const { Field } = require('./Base');

/**
 * String field type.
 * @extends Field
 */
class StringField extends Field {
    write(record, value) {
        return super.write(record, String(value));
    }
    read(record) {
        const value = super.read(record);
        if (value === null || value === undefined) {
            return null;
        }
        return String(value);
    }
    serialize(record) {
        const value = this.read(record);
        if (value === null || value === undefined) {
            return null;
        }
        return String(value);
    }

    getMetadata() {
        const meta = super.getMetadata();
        meta.length = this.definition.length;
        return meta;
    }

    buildColumn(table, metadata) {
        return super.buildColumn(table, metadata, () => {
            return table.string(this.name, this.definition.length || 255);
        });
    }
}

Field.behaviors.string = StringField;

module.exports = { StringField };   
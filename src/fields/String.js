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
    column(table) {
        const length = this.definition.length || 255;
        const column = table.string(this.name, length);
        if (this.definition.required) {
            column.notNullable();
        } else {
            column.nullable();
        }
        return column;
    }
}

Field.behaviors.string = StringField;

module.exports = { StringField };   
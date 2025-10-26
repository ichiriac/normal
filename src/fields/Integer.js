const { Field } = require('./Base');

/**
 * Integer field type.
 * @extends Field
 */
class IntegerField extends Field {
    write(record, value) {
        const intValue = parseInt(value, 10);
        if (isNaN(intValue)) {
            throw new Error(`Invalid integer value for field ${this.name}: ${value}`);
        }
        return super.write(record, intValue);
    }
    read(record) {
        const value = super.read(record);   
        if (value === null || value === undefined) {
            return null;
        }   
        return parseInt(value, 10);
    }
    serialize(record) {
        const value = this.read(record);
        if (value === null || value === undefined) {
            return null;
        }
        return parseInt(value, 10);
    }

    getMetadata() {
        const meta = super.getMetadata();
        meta.unsigned = !!this.definition.unsigned;
        return meta;
    }

    getColumnDefinition(table) {
        const column = table.integer(this.column);
        if (this.definition.unsigned) {
            column.unsigned();
        }
        return column;
    }
}
Field.behaviors.integer = IntegerField;
Field.behaviors.number = IntegerField;

module.exports = { IntegerField };
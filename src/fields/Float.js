const { Field } = require('./Base');

/**
 * Float field type.
 * @extends Field
 */
class FloatField extends Field {
    write(record, value) {
        const floatValue = parseFloat(value);
        if (isNaN(floatValue)) {
            throw new Error(`Invalid float value for field ${this.name}: ${value}`);
        }
        return super.write(record, floatValue);
    }
    read(record) {
        const value = super.read(record);
        if (value === null || value === undefined) {
            return null;
        }
        return parseFloat(value);
    }
    serialize(record) {
        const value = this.read(record);
        if (value === null || value === undefined) {
            return null;
        }
        return parseFloat(value);
    }
    column(table) {
        const column = table.float(this.name);
        if (this.definition.unsigned) {
            column.unsigned();
        }
        if (this.definition.precision && this.definition.scale) {
            column.precision(this.definition.precision, this.definition.scale);
        }
        return column;
    }
}
Field.behaviors.float = FloatField;

module.exports = { FloatField };
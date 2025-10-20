const { Field } = require('./Base');

/**
 * Enum field type.
 * @extends Field
 */
class EnumField extends Field {
    constructor(model, name, definition) {
        super(model, name, definition);
        if (!definition.values || !Array.isArray(definition.values)) {
            throw new Error(`Enum field ${name} must have a 'values' array in its definition`);
        }
        this.values = definition.values;
    }

    write(record, value) {
        if (!this.values.includes(value)) {
            throw new Error(`Invalid value for enum field ${this.name}: ${value}`);
        }
        return super.write(record, value);
    }

    read(record) {
        const value = super.read(record);
        if (!this.values.includes(value)) {
            throw new Error(`Invalid value for enum field ${this.name}: ${value}`);
        }
        return value;
    }
    column(table) {
        const column = table.enum(this.name, this.values);
        if (this.definition.required) {
            column.notNullable();
        } else {
            column.nullable();
        }
        return column;
    }
}

Field.behaviors.enum = EnumField;

module.exports = { EnumField };
const { Field } = require('./Base');
const knex = require('knex');

/**
 * Datetime field type.
 * @extends Field
 */
class DateTimeField extends Field {
    write(record, value) {
        if (value instanceof Date) {
            return super.write(record, value);
        }
        else if (typeof value === "string" || typeof value === "number") {
            const date = new Date(value);  
            if (isNaN(date.getTime())) {
                throw new Error(`Invalid datetime value for field ${this.name}: ${value}`);
            }
            return super.write(record, date);
        } else if (value === null || value === undefined) {
            return super.write(record, null);
        } else {
            throw new Error(`Invalid type for datetime field ${this.name}: ${typeof value}`);
        }
    }
    getMetadata() {
        const meta = super.getMetadata();
        meta.defaultToNow = this.definition.defaultToNow;
        return meta;
    }

    read(record) {
        const value = super.read(record);
        if (value === null || value === undefined) {
            return null;
        }
        return new Date(value);
    }
    deserialize(record, value) {
        if (!value && value !== 0) return null;
        const result = new Date(value);
        if (isNaN(result.getTime())) {
            throw new Error(`Invalid date value for field ${this.name}: ${value}`);
        }
        return result;
    }
    serialize(record) {
        const value = this.read(record);
        if (value instanceof Date) {
            return value.getTime();
        }
        return null;
    }
    getColumnDefinition(table) {
        const column = table.timestamp(this.name, { useTz: false });
        if (this.definition.defaultToNow) {
            column.defaultTo(this.model.repo.cnx.fn.now());
        }
        return column;
    }
}

Field.behaviors.datetime = DateTimeField;
Field.behaviors.timestamp = DateTimeField;

module.exports = { DateTimeField };
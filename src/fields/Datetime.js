const { Field } = require('./Base');

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
    read(record) {
        const value = super.read(record);
        if (value === null || value === undefined) {
            return null;
        }
        return new Date(value);
    }
    unserialize(record, value) {
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
    buildColumn(table, metadata) {
        return super.buildColumn(table, metadata, () => {
            return table.timestamp(this.name, { useTz: false });
        });
    }
}

Field.behaviors.datetime = DateTimeField;
Field.behaviors.timestamp = DateTimeField;

module.exports = { DateTimeField };
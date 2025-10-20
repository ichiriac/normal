const { Field } = require('./Base');

/**
 * Text field type.
 * @extends Field
 */
class TextField extends Field {
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
        return table.text(this.name);
    }
}

Field.behaviors.text = TextField;

module.exports = { TextField };
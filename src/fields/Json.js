const { Field } = require('./Base');

/**
 * JSON field type.
 * @extends Field
 */
class JsonField extends Field {
    unserialize(record, value) {
        return JSON.parse(value);
    }
    column(table) {
        return table.json(this.name);
    }
}

Field.behaviors.json = JsonField;

module.exports = { JsonField };
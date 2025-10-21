const { Field } = require('./Base');

/**
 * JSON field type.
 * @extends Field
 */
class JsonField extends Field {
    unserialize(record, value) {
        return JSON.parse(value);
    }
    buildColumn(table, metadata) {
        return super.buildColumn(table, metadata, () => {
            return table.json(this.name);
        });
    }
}

Field.behaviors.json = JsonField;

module.exports = { JsonField };
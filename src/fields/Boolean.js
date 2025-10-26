const { Field } = require('./Base');

/**
 * Boolean field type.
 * @extends Field
 */
class BooleanField extends Field {
  write(record, value) {
    return super.write(record, Boolean(value));
  }
  read(record) {
    const value = super.read(record);
    return Boolean(value);
  }
  serialize(record) {
    const value = this.read(record);
    return value ? 1 : 0;
  }
  getColumnDefinition(table) {
    return table.boolean(this.column);
  }
}

Field.behaviors.boolean = BooleanField;

module.exports = { BooleanField };

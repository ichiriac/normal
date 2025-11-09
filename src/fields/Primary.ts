// @ts-nocheck - TODO: Add proper type annotations
import { Field } from './Base';

/**
 * Primary key field type.
 * @extends Field
 */
class Primary extends Field {
  /**
   * Sets the primary key value on the record.
   * @param {*} record
   * @param {*} value
   * @returns
   */
  write(record, value) {
    if (record._data[this.column]) {
      throw new Error(`Cannot modify primary key field ${this.name}`);
    }
    record._data[this.column] = value;
    this.model.entities.set(value, record);
    return record;
  }

  read(record) {
    return record._data[this.column];
  }

  getMetadata() {
    return {
      type: 'primary',
      column: this.column,
    };
  }

  getColumnDefinition(table) {
    return table.increments(this.column).primary();
  }
}

Field.behaviors.primary = Primary;
export { Primary };

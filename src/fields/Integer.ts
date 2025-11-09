// @ts-nocheck - TODO: Add proper type annotations
import { Field } from './Base';

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
    const wrapper = function (v) {
      if (v === null || v === undefined) {
        return null;
      }
      return parseInt(v, 10);
    };
    if (value instanceof Promise) return value.then(wrapper);
    return wrapper(value);
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

export { IntegerField };

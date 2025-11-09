// @ts-nocheck - TODO: Add proper type annotations
import { Field  } from './Base';

/**
 * JSON field type.
 * @extends Field
 */
class JsonField extends Field {
  deserialize(record, value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    return JSON.parse(value);
  }
  serialize(record) {
    const value = this.read(record);
    return JSON.stringify(value);
  }
  getColumnDefinition(table) {
    return table.json(this.column);
  }
}

Field.behaviors.json = JsonField;

export { JsonField  };

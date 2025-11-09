import { Field } from './Base';
import { Record as ActiveRecord } from '../Record';

/**
 * JSON field type.
 * @extends Field
 */
class JsonField extends Field {
  deserialize(_record: ActiveRecord, value: any): any {
    if (!value) return null;
    if (typeof value === 'object') return value;
    return JSON.parse(value);
  }
  serialize(record: ActiveRecord): string {
    const value = this.read(record);
    return JSON.stringify(value);
  }
  getColumnDefinition(table: any): any {
    return table.json(this.column);
  }
}

Field.behaviors.json = JsonField;

export { JsonField };

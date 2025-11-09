import { Field, FieldDefinition } from './Base';
import { Record as ActiveRecord } from '../Record';
import { Model } from '../Model';

/**
 * Integer field type.
 * @extends Field
 */
class IntegerField extends Field {
  constructor(model: Model, name: string, definition: FieldDefinition) {
    super(model, name, definition);
  }
  write(record: ActiveRecord, value: any): ActiveRecord {
    const intValue = parseInt(value, 10);
    if (isNaN(intValue)) {
      throw new Error(`Invalid integer value for field ${this.name}: ${value}`);
    }
    return super.write(record, intValue);
  }
  read(record: ActiveRecord): any {
    const value = super.read(record);
    const wrapper = function (v: any) {
      if (v === null || v === undefined) {
        return null;
      }
      return parseInt(v, 10);
    };
    if (value instanceof Promise) return value.then(wrapper);
    return wrapper(value);
  }

  getMetadata() {
    const meta = super.getMetadata() as any;
    (meta as any).unsigned = !!(this.definition as any).unsigned;
    return meta;
  }

  getColumnDefinition(table: any): any {
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

import { Field } from './Base';
import { Record as ActiveRecord } from '../Record';
import { Model } from '../Model';
import { FieldDefinition } from './Base';

/**
 * Boolean field type.
 * @extends Field
 */
class BooleanField extends Field {
  constructor(model: Model, name: string, definition: FieldDefinition) {
    super(model, name, definition);
  }
  write(record: ActiveRecord, value: any): ActiveRecord {
    return super.write(record, Boolean(value));
  }
  read(record: ActiveRecord): Boolean | null {
    const value = super.read(record);
    return value === null || value === undefined ? null : Boolean(value);
  }
  serialize(record: ActiveRecord): number {
    const value = this.read(record);
    return value ? 1 : 0;
  }
  getColumnDefinition(table: any): any {
    return table.boolean(this.column);
  }
}

Field.behaviors.boolean = BooleanField;

export { BooleanField };

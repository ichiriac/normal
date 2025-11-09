import { Field, FieldDefinition } from './Base';
import { Record as ActiveRecord } from '../Record';
import { Model } from '../Model';

/**
 * Text field type.
 * @extends Field
 */
class TextField extends Field {
  constructor(model: Model, name: string, definition: FieldDefinition) {
    super(model, name, definition);
  }
  write(record: ActiveRecord, value: any): ActiveRecord {
    return super.write(record, String(value));
  }
  read(record: ActiveRecord): any {
    const value = super.read(record);
    if (value === null || value === undefined) {
      return null;
    }
    return String(value);
  }
  serialize(record: ActiveRecord): string | null {
    const value = this.read(record);
    if (value === null || value === undefined) {
      return null;
    }
    return String(value);
  }
  getMetadata() {
    const meta = super.getMetadata() as any;
    delete (meta as any).index;
    delete (meta as any).unique;
    return meta;
  }
  getColumnDefinition(table: any): any {
    return table.text(this.column);
  }
}

Field.behaviors.text = TextField;
export { TextField };

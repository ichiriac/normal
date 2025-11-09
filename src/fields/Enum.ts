import { Field, FieldDefinition } from './Base';
import { Record as ActiveRecord } from '../Record';
import { Model } from '../Model';

/**
 * Enum field type.
 * @extends Field
 */
class EnumField extends Field {
  constructor(model: Model, name: string, definition: FieldDefinition) {
    super(model, name, definition);
    if (!(definition as any).values || !Array.isArray((definition as any).values)) {
      throw new Error(`Enum field ${name} must have a 'values' array in its definition`);
    }
  }

  write(record: ActiveRecord, value: any): ActiveRecord {
    if (!value && (this.definition as any).required) {
      throw new Error(`Field ${this.name} is required and cannot be null or undefined`);
    }
    if (value && !(this.definition as any).values.includes(value)) {
      throw new Error(`Invalid value for enum field ${this.name}: ${value}`);
    }
    return super.write(record, value);
  }

  read(record: ActiveRecord): any {
    const value = super.read(record);
    if (value && !(this.definition as any).values.includes(value)) {
      throw new Error(`Invalid value for enum field ${this.name}: ${value}`);
    }
    return value;
  }
  getMetadata() {
    const meta = super.getMetadata();
    (meta as any).values = (this.definition as any).values;
    return meta;
  }
  getColumnDefinition(table: any): any {
    return table.enum(this.column, (this.definition as any).values);
  }
}

Field.behaviors.enum = EnumField;

export { EnumField };

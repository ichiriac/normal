import { Field, FieldDefinition } from './Base';
import { Record as ActiveRecord } from '../Record';
import { Model } from '../Model';

/**
 * Float field type.
 * @extends Field
 */
class FloatField extends Field {
  constructor(model: Model, name: string, definition: FieldDefinition) {
    super(model, name, definition);
  }
  write(record: ActiveRecord, value: any): ActiveRecord {
    const floatValue = parseFloat(value);
    if (isNaN(floatValue)) {
      throw new Error(`Invalid float value for field ${this.name}: ${value}`);
    }
    return super.write(record, floatValue);
  }
  read(record: ActiveRecord): any {
    const value = super.read(record);
    if (value === null || value === undefined) {
      return null;
    }
    return parseFloat(value);
  }
  serialize(record: ActiveRecord): number | null {
    const value = this.read(record);
    if (value === null || value === undefined) {
      return null;
    }
    return parseFloat(value);
  }

  getMetadata() {
    const meta = super.getMetadata() as any;
    (meta as any).unsigned = !!(this.definition as any).unsigned;
    (meta as any).precision = (this.definition as any).precision;
    (meta as any).scale = (this.definition as any).scale;
    return meta;
  }

  getColumnDefinition(table: any): any {
    const column = table.float(this.column);
    if (this.definition.unsigned) {
      column.unsigned();
    }
    if (this.definition.precision && this.definition.scale) {
      column.precision(this.definition.precision, this.definition.scale);
    }
    return column;
  }
}
Field.behaviors.float = FloatField;

export { FloatField };

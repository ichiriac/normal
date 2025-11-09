import { Field, FieldDefinition } from './Base';
import { Record as ActiveRecord } from '../Record';
import { Model } from '../Model';
import { DateFieldMetadata } from './Date';

/**
 * Datetime field type.
 * @extends Field
 */
class DateTimeField extends Field {
  constructor(model: Model, name: string, definition: FieldDefinition) {
    super(model, name, definition);
  }
  write(record: ActiveRecord, value: any): ActiveRecord {
    if (value instanceof Date) {
      return super.write(record, value);
    } else if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new Error(`Invalid datetime value for field ${this.name}: ${value}`);
      }
      return super.write(record, date);
    } else if (value === null || value === undefined) {
      return super.write(record, null);
    } else {
      throw new Error(`Invalid type for datetime field ${this.name}: ${typeof value}`);
    }
  }
  getMetadata(): DateFieldMetadata {
    const meta = super.getMetadata() as DateFieldMetadata;
    meta.defaultToNow = (this.definition as any).defaultToNow;
    return meta;
  }

  read(record: ActiveRecord): Date | null {
    const value = super.read(record);
    if (value === null || value === undefined) {
      return null;
    }
    return value instanceof Date ? value : new Date(value);
  }
  deserialize(_record: ActiveRecord, value: any): Date | null {
    if (!value && value !== 0) return null;
    const result = new Date(value);
    if (isNaN(result.getTime())) {
      throw new Error(`Invalid date value for field ${this.name}: ${value}`);
    }
    return result;
  }
  serialize(record: ActiveRecord): number | null {
    const value = this.read(record);
    if (value instanceof Date) {
      return value.getTime();
    }
    return null;
  }
  getColumnDefinition(table: any): any {
    const column = table.timestamp(this.column, { useTz: false });
    if (this.definition.defaultToNow) {
      column.defaultTo(this.model.repo.cnx.fn.now());
    }
    return column;
  }
}

Field.behaviors.datetime = DateTimeField;
Field.behaviors.timestamp = DateTimeField;

export { DateTimeField };

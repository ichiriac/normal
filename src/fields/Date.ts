import { Field, FieldDefinition, FieldMetadata } from './Base';
import { Record as ActiveRecord } from '../Record';
import { Model } from '../Model';

export interface DateFieldMetadata extends FieldMetadata {
  /**
   * Indicates if the date field should default to the current date and time.
   */
  defaultToNow?: boolean;
}

/**
 * Date field type.
 * @extends Field
 */
class DateField extends Field {
  constructor(model: Model, name: string, definition: FieldDefinition) {
    super(model, name, definition);
  }
  write(record: ActiveRecord, value: any): ActiveRecord {
    if (value instanceof Date) {
      return super.write(record, value);
    } else if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new Error(`Invalid date value for field ${this.name}: ${value}`);
      }
      return super.write(record, date);
    } else if (value === null || value === undefined) {
      return super.write(record, null);
    } else {
      throw new Error(`Invalid type for date field ${this.name}: ${typeof value}`);
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

  serialize(record: ActiveRecord): string | null {
    const value = this.read(record);
    if (value instanceof Date) {
      return value.toISOString();
    }
    return null;
  }

  getColumnDefinition(table: any): any {
    const column = table.date(this.column);
    if (this.definition.defaultToNow) {
      column.defaultTo(this.model.repo.cnx.fn.now());
    }
    return column;
  }
}

Field.behaviors.date = DateField;

export { DateField };

// @ts-nocheck - TODO: Add proper type annotations
import { Field  } from './Base';
import knex from 'knex';

/**
 * Date field type.
 * @extends Field
 */
class DateField extends Field {
  write(record, value) {
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

  getMetadata() {
    const meta = super.getMetadata();
    meta.defaultToNow = this.definition.defaultToNow;
    return meta;
  }

  read(record) {
    const value = super.read(record);
    if (value === null || value === undefined) {
      return null;
    }
    return new Date(value);
  }

  serialize(record) {
    const value = this.read(record);
    if (value instanceof Date) {
      return value.toISOString();
    }
    return null;
  }

  getColumnDefinition(table) {
    const column = table.date(this.column);
    if (this.definition.defaultToNow) {
      column.defaultTo(this.model.repo.cnx.fn.now());
    }
    return column;
  }
}

Field.behaviors.date = DateField;

export { DateField  };

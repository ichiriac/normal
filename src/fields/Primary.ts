import { Field, FieldDefinition } from './Base';
import { Record as ActiveRecord } from '../Record';
import { Model } from '../Model';

/**
 * Primary key field type.
 * @extends Field
 */
class Primary extends Field {
  constructor(model: Model, name: string, definition: FieldDefinition) {
    super(model, name, definition);
  }
  /**
   * Sets the primary key value on the record.
   * @param {*} record
   * @param {*} value
   * @returns
   */
  write(record: ActiveRecord, value: any): ActiveRecord {
    if (record._data[this.column]) {
      throw new Error(`Cannot modify primary key field ${this.name}`);
    }
    record._data[this.column] = value;
    this.model.entities.set(value, record);
    return record;
  }

  read(record: ActiveRecord): any {
    return record._data[this.column];
  }

  getMetadata(): any {
    // keep minimal metadata for primary while remaining compatible with FieldMetadata
    const meta: any = super.getMetadata();
    meta.type = 'primary';
    // primary is always stored and required by nature; unique and index managed by DB
    meta.stored = true;
    meta.required = true;
    // Remove constraints not applicable or redundant
    delete meta.unique;
    delete meta.index;
    // Keep column as-is
    return meta;
  }

  getColumnDefinition(table: any): any {
    return table.increments(this.column).primary();
  }
}

Field.behaviors.primary = Primary;
export { Primary };

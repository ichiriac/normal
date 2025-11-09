// @ts-nocheck - TODO: Add proper type annotations
import { Field } from './Base';

/**
 * Enum field type.
 * @extends Field
 */
class EnumField extends Field {
  constructor(model, name, definition) {
    super(model, name, definition);
    if (!definition.values || !Array.isArray(definition.values)) {
      throw new Error(`Enum field ${name} must have a 'values' array in its definition`);
    }
  }

  write(record, value) {
    if (!value && this.definition.required) {
      throw new Error(`Field ${this.name} is required and cannot be null or undefined`);
    }
    if (value && !this.definition.values.includes(value)) {
      throw new Error(`Invalid value for enum field ${this.name}: ${value}`);
    }
    return super.write(record, value);
  }

  read(record) {
    const value = super.read(record);
    if (value && !this.definition.values.includes(value)) {
      throw new Error(`Invalid value for enum field ${this.name}: ${value}`);
    }
    return value;
  }
  getMetadata() {
    const meta = super.getMetadata();
    meta.values = this.definition.values;
    return meta;
  }
  getColumnDefinition(table) {
    return table.enum(this.column, this.definition.values);
  }
}

Field.behaviors.enum = EnumField;

export { EnumField };

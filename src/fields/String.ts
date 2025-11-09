import { Field, FieldDefinition } from './Base';
import { Record as ActiveRecord } from '../Record';
import { Model } from '../Model';
import validator from 'validator';
/**
 * String field type.
 * @extends Field
 */
class StringField extends Field {
  static validators: Record<string, (...args: any[]) => boolean> = {
    isEmail: (value: string) => {
      return validator.isEmail(value);
    },
    isIP4: (value: string) => {
      return validator.isIP(value, 4);
    },
    isIP6: (value: string) => {
      return validator.isIP(value, 6);
    },
    isDataURI: (value: string) => {
      return validator.isDataURI(value);
    },
    isSemVer: (value: string) => {
      return validator.isSemVer(value);
    },
    isURL: (value: string) => {
      return validator.isURL(value);
    },
    isHexColor: (value: string) => {
      return validator.isHexColor(value);
    },
    isFQDN: (value: string) => {
      return validator.isFQDN(value);
    },
    is: (value: string, pattern: RegExp | string) => {
      return typeof pattern === 'string'
        ? validator.matches(value, pattern)
        : validator.matches(value, pattern);
    },
    not: (value: string, pattern: RegExp | string) => {
      return !(typeof pattern === 'string'
        ? validator.matches(value, pattern)
        : validator.matches(value, pattern));
    },
  };

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

  validate(record: ActiveRecord): any {
    const value = super.validate(record);
    if (this.definition.validate && value !== null && value !== undefined) {
      for (const [rule, param] of Object.entries(this.definition.validate)) {
        const validatorFn = (StringField.validators as any)[rule];
        if (validatorFn) {
          const isValid = param === true ? validatorFn(value) : validatorFn(value, param);
          if (!isValid) {
            throw new Error(
              `Validation failed for field '${this.name}': rule '${rule}' with parameter '${param}'`
            );
          }
        }
      }
    }
    return value;
  }

  getMetadata() {
    const meta = super.getMetadata();
    (meta as any).size = (this.definition as any).size || 255;
    (meta as any).validate = (this.definition as any).validate || {};
    return meta;
  }

  getColumnDefinition(table: any): any {
    return table.string(this.column, (this.definition as any).size || 255);
  }
}

Field.behaviors.string = StringField;

export { StringField };

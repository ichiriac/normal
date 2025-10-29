const { Field } = require('./Base');
const validator = require('validator');
/**
 * String field type.
 * @extends Field
 */
class StringField extends Field {
  static validators = {
    isEmail: (value) => {
      return validator.isEmail(value);
    },
    isIP4: (value) => {
      return validator.isIP(value, { version: 4 });
    },
    isIP6: (value) => {
      return validator.isIP(value, { version: 6 });
    },
    isDataURI: (value) => {
      return validator.isDataURI(value);
    },
    isSemVer: (value) => {
      return validator.isSemVer(value);
    },
    isURL: (value) => {
      return validator.isURL(value);
    },
    isHexColor: (value) => {
      return validator.isHexColor(value);
    },
    isFQDN: (value) => {
      return validator.isFQDN(value);
    },
    is: (value, pattern) => {
      return validator.matches(value, pattern);
    },
    not: (value, pattern) => {
      return !validator.matches(value, pattern);
    },
  };

  constructor(model, name, definition) {
    super(model, name, definition);
  }

  write(record, value) {
    return super.write(record, String(value));
  }

  read(record) {
    const value = super.read(record);
    if (value === null || value === undefined) {
      return null;
    }
    return String(value);
  }

  validate(record) {
    const value = super.validate(record);
    if (this.definition.validate) {
      for (const [rule, param] of Object.entries(this.definition.validate)) {
        const validatorFn = StringField.validators[rule];
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
    meta.size = this.definition.size;
    meta.validate = this.definition.validate || {};
    return meta;
  }

  getColumnDefinition(table) {
    return table.string(this.column, this.definition.size || 255);
  }
}

Field.behaviors.string = StringField;

module.exports = { StringField };

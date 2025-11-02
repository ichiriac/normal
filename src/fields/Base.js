const EventEmitter = require('node:events');
const { selectRootIdsByLeafRecord } = require('../utils/dependency');

/**
 * Base class for all field types.
 */
class Field {
  static behaviors = {};

  /**
   * Build a field instance based on its definition.
   * @param {*} model
   * @param {*} name
   * @param {*} definition
   * @returns
   */
  static define(model, name, definition) {
    if (typeof definition === 'string') {
      definition = { type: definition.toLowerCase() };
    }
    if (definition instanceof Field) {
      definition = definition.definition;
    }
    const fieldType = definition.type ? definition.type : null;
    if (fieldType && Field.behaviors.hasOwnProperty(fieldType)) {
      const BehaviorClass = Field.behaviors[fieldType];
      return new BehaviorClass(model, name, definition);
    } else {
      throw new Error(
        `Unknown field type: ${definition.type} for field ${name} in model ${model.name}`
      );
    }
  }

  /**
   * Initialize a new field.
   * @param {*} model
   * @param {*} name
   * @param {*} definition
   */
  constructor(model, name, definition) {
    this.model = model;
    this.name = name;
    this.definition = definition;
    this.type = definition.type;
    this.column = definition.column || name;
    this.events = new EventEmitter();
    if (definition.compute) {
      this.stored = definition.stored === true;
    } else {
      this.stored = definition.stored !== false;
    }
    this.compute = definition.compute || null;
    this.depends = definition.depends || [];
    this.triggers = false;
    this.description = definition.description || null;
    if (this.compute && typeof this.compute === 'string') {
      if (typeof this.model.cls.prototype[this.compute] !== 'function') {
        throw new Error(
          `Compute method '${this.compute}' for field '${name}' in model '${model.name}' is not defined`
        );
      }
    }
    const allowed_keys = Object.keys(this.getMetadata());
    for (let key of Object.keys(definition)) {
      if (!allowed_keys.includes(key)) {
        throw new Error(
          `Unknown field definition key '${key}' for field '${name}' in model '${model.name}'`
        );
      }
    }
    Object.freeze(this.definition);
  }

  /**
   * Handle change events on the field.
   * @param {*} listener
   */
  onChange(listener) {
    this.events.on('change', listener);
    this.triggers = true;
    return this;
  }

  /**
   * Attach the field to a record prototype.
   * @param {*} proto
   */
  attach(model, cls) {
    const self = this;
    Object.defineProperty(cls.prototype, this.name, {
      get: function () {
        return self.read(this);
      },
      set: function (value) {
        self.write(this, value);
      },
      configurable: true,
      enumerable: true,
    });
    model.fields = model.fields || {};
    model.fields[this.name] = this;
  }

  /**
   * Hook after initializing and attaching fields to the model
   */
  post_attach() {
    // Hook after attaching field to record prototype
    for (const dependency of this.depends) {
      if (typeof dependency !== 'string') {
        throw new Error(
          `Depends entries must be strings for field '${this.name}' in model '${this.model.name}'`
        );
      }
      const parts = dependency.split('.');
      let model = this.model;
      let path = [];
      for (const part of parts) {
        if (!model) {
          throw new Error(
            `Depends entry '${dependency}' for field '${this.name}' in model '${this.model.name}' is invalid`
          );
        }
        if (!model.fields.hasOwnProperty(part)) {
          throw new Error(
            `Field '${part}' for dependency '${dependency}' is not found in model '${model.name}'`
          );
        }
        if (!model.cls_init) {
          model._init();
        }
        path.push(part);
        const field = model.fields[part];
        field.onChange(
          async function (path, record) {
            if (path.indexOf('.') !== -1) {
              // lookup for related record
              const result = await selectRootIdsByLeafRecord(this.model, path, record);
              for (const rec of result) {
                this.recompute(rec);
              }
            } else {
              // local lookup
              this.recompute(record);
            }
          }.bind(this, path.join('.') + (field.refModel ? '.id' : ''))
        );
        if (field.refModel) {
          model = field.refModel;
        }
      }
    }
  }

  /**
   * Get the database connection.
   * @returns Knex instance
   */
  get cnx() {
    return this.model.repo.cnx;
  }

  /**
   * Get the repository.
   * @returns Repository instance
   */
  get repo() {
    return this.model.repo;
  }

  /**
   * Compute the field value.
   * @param {Record} record
   * @returns
   */
  recompute(record) {
    if (!this.compute) {
      throw new Error(`Field ${this.name} is not computed.`);
    }
    const initialValue = record._changes.hasOwnProperty(this.column)
      ? record._changes[this.column]
      : record._data[this.column];
    const computeMethod =
      typeof this.compute === 'string'
        ? record[this.compute].bind(record)
        : this.compute.bind(record);
    const computedValue = computeMethod();

    const wrapPromise = (val) => {
      if (this.stored) {
        record._changes[this.column] = val;
      } else {
        record._data[this.column] = val;
      }
      if (initialValue === undefined && !record.id) return val;
      if (initialValue !== val) {
        this.events.emit('change', record, this);
      }
      return val;
    };

    if (computedValue instanceof Promise) {
      return computedValue.then(wrapPromise);
    }
    return wrapPromise(computedValue);
  }

  /**
   * Validate the field value.
   * @param {Record} record
   */
  validate(record) {
    const value = this.read(record);
    if (this.definition.required && (value === null || value === undefined)) {
      throw new Error(`Field '${this.name}' is required in model '${this.model.name}'`);
    }
    return value;
  }

  /**
   * Method used to write the field value to a record.
   * @param {Record} record
   * @param {*} value
   * @returns
   */
  write(record, value) {
    if (!this.stored) {
      throw new Error(`Field ${this.name} is computed and cannot be set directly.`);
    }
    if (record._data[this.column] === value) {
      delete record._changes[this.column];
      record._isDirty = Object.keys(record._changes).length > 0;
    } else {
      record._changes[this.column] = value;
      record._isDirty = true;
      this.events.emit('change', record, this);
    }
    return record;
  }

  /**
   * Method used to read the field value from a record.
   * @param {Record} record
   * @returns
   */
  read(record) {
    if (record._changes.hasOwnProperty(this.column)) {
      return record._changes[this.column];
    }

    if (record._data.hasOwnProperty(this.column) && record._data[this.column] !== null) {
      return record._data[this.column];
    }

    if (this.compute) {
      return this.recompute(record);
    }

    if (this.definition.default !== undefined) {
      if (typeof this.definition.default === 'function') {
        record._changes[this.column] = this.definition.default();
      } else {
        record._changes[this.column] = this.definition.default;
      }
      return record._changes[this.column];
    }
    return null;
  }

  /**
   * Checks if the specified type is the same
   * @param {*} value
   * @returns
   */
  isSameType(type) {
    return this.type === type;
  }

  /**
   * Method used to serialize the field value for storage.
   * @param {*} record
   * @returns
   */
  serialize(record) {
    return this.read(record);
  }

  /**
   * Serialize value for JSON output.
   * @param {*} value
   * @returns
   */
  toJSON(record) {
    return this.serialize(record);
  }

  /**
   * Deserialize value from storage.
   * @param {*} value
   * @returns
   */
  deserialize(record, value) {
    return value;
  }

  getMetadata() {
    const meta = {
      column: this.column,
      type: this.definition.type,
      stored: this.stored,
      compute: this.compute,
      depends: this.depends,
      description: this.description,
      required: !!this.definition.required,
      unique: !!this.definition.unique,
      index: !!this.definition.index,
      default: undefined,
    };

    if (this.definition.default !== undefined && typeof this.definition.default !== 'function') {
      meta.default = this.definition.default;
    }
    return meta;
  }

  /**
   * Get the column definition for this field.
   * @param {*} table
   * @returns
   */
  getColumnDefinition(table) {
    throw new Error(
      'getColumnDefinition method not implemented for field type ' + this.definition.type
    );
  }

  /**
   * Get the column definition and apply common constraints.
   * @param {*} table
   * @returns
   */
  getBuilderColumn(table) {
    if (!this.stored) return null;
    const column = this.getColumnDefinition(table);
    if (!column) return null;
    if (this.definition.description) {
      column.comment(this.definition.description);
    }
    if (this.definition.required) {
      column.notNullable();
    } else {
      column.nullable();
    }
    if (this.definition.default !== undefined && typeof this.definition.default !== 'function') {
      column.defaultTo(this.definition.default);
    }
    return column;
  }

  /**
   * Method that initializes the database column for this field.
   * @param {*} table
   */
  buildColumn(table, metadata) {
    if (!metadata) {
      return !!this.getBuilderColumn(table);
    }
    if (this.column !== metadata.column) {
      table.renameColumn(metadata.column, this.column);
      return true;
    }
    return false;
  }

  /**
   * Checks if the field definition has changed.
   * @param {*} metadata
   * @returns
   */
  isDefChanged(metadata) {
    if (!metadata) return true;
    const definition = this.getMetadata();
    for (let k in definition) {
      if (k === 'column') continue;
      if (k === 'default' && typeof definition[k] === 'function') continue;
      if (k === 'index') continue;
      if (k === 'compute') continue;
      if (k === 'depends') continue;
      if (k === 'description') continue;

      if (JSON.stringify(definition[k]) != JSON.stringify(metadata[k])) {
        return true;
      }
    }
    return false;
  }

  /**
   * Replace a column while migrating data.
   * @param {*} table
   * @param {*} name
   * @param {*} columnCallback
   * @returns
   */
  async replaceColumn() {
    const mig_suffix = '_mig_tmp';
    const name = this.column;
    const exists = await this.cnx.schema
      .queryContext({ ignore: true })
      .hasColumn(this.model.table, name + mig_suffix);
    await this.cnx.schema.table(this.model.table, async (table) => {
      if (exists) {
        table.dropColumn(name + mig_suffix);
      }
      table.renameColumn(name, name + mig_suffix);
    });
    await this.cnx.schema.table(this.model.table, async (table) => {
      this.getBuilderColumn(table);
    });

    try {
      await this.cnx.raw(`UPDATE ${this.model.table} SET ${name} = ${name + mig_suffix}`);
      return true;
    } catch (err) {
      console.warn(`Warning: unable to migrate contents from ${name}`);
      return false;
    }
  }

  /**
   * Method that initializes indexes for this field.
   * @param {*} table
   */
  buildIndex(table, metadata) {
    if (!this.stored) return null;

    let changed = false;
      const prevUnique = metadata && metadata.unique;
      const prevIndexed = metadata && metadata.index;

    if (this.definition.unique) {
      // Flagged as unique, before was just indexed
      if (prevIndexed && !prevUnique) {
        table.dropIndex(this.column);
        changed = true;
      }
      // Add unique constraint
      if (!prevUnique) {
        table.unique(this.column);
        changed = true;
      }
    } else if (prevUnique) {
      // Was unique, now not unique
      table.dropUnique(this.column);
      changed = true;
    }

    // add index if not already indexed by unique constraint
    if (this.definition.index && !this.definition.unique) {
      if (!prevIndexed) {
        table.index(this.column);
        changed = true;
      }
    }
    return changed;
  }

  /**
   * Run table post-processing after initial build, usefull for
   * manipulating columns or defining foreign keys.
   * @param {*} metadata
   * @returns
   */
  async buildPostIndex(metadata) {
    if (!this.stored) return null;
    if (metadata && this.isDefChanged(metadata)) {
      await this.replaceColumn();
      return true;
    }
    return false;
  }

  async post_create(record) {
    // Hook after record creation
  }

  async pre_create(record) {
    // Hook before record creation
  }

  async pre_update(record) {
    // Hook before record update
  }

  async post_update(record) {
    // Hook after record update
  }

  async pre_unlink(record) {
    // Hook before record unlinking
  }

  async post_unlink(record) {
    // Hook after record unlinking
  }
}

module.exports = { Field };

// @ts-nocheck - TODO: Add proper type annotations
import { Field  } from './Base';

const ALIAS = ['onetomany', 'one-to-many', 'one2many'];

/**
 * One-to-many relationship field, exemple : comments in a Post model.
 */
class OneToMany extends Field {
  constructor(model, name, definition) {
    super(model, name, definition);
    if (!this.definition.foreign) {
      throw new Error(`OneToMany field "${name}" requires a "foreign" definition`);
    }
    [this.refModelName, this.refFieldName] = this.definition.foreign.split('.');
    this.stored = false;
  }

  get refModel() {
    return this.model.repo.get(this.refModelName);
  }

  onChange(listener) {
    super.onChange(listener);
    this.refModel.on('create', listener);
    this.refModel.on('unlink', listener);
    return this;
  }

  getMetadata() {
    const meta = super.getMetadata();
    meta.foreign = this.definition.foreign;
    meta.where = this.definition.where;
    delete meta.index;
    delete meta.unique;
    delete meta.required;
    return meta;
  }

  isSameType(type) {
    return ALIAS.indexOf(type) !== -1;
  }

  read(record) {
    const result = super.read(record);
    if (!result) {
      let where = {};
      if (this.refFieldName) {
        where[this.refFieldName] = record.id;
      }
      if (this.definition.where) {
        if (typeof this.definition.where === 'function') {
          where = this.definition.where(record, this);
        } else {
          where = { ...where, ...this.definition.where };
        }
      }
      const relatedRecords = this.refModel.where(where);

      relatedRecords.then((records) => {
        delete record._changes[this.column];
        record._data[this.column] = records;
      });
      return relatedRecords;
    }
    return Promise.resolve(result);
  }

  /**
   * Deserialize records for one-to-many fields
   * @param {*} record
   * @param {*} value
   * @returns
   */
  deserialize(record, value) {
    if (!Array.isArray(value)) {
      value = [value];
    }
    return value.map((v) => {
      v[this.refFieldName] = record;
      return this.refModel.allocate(v);
    });
  }

  /**
   * Handling writes to one-to-many fields (to pre-compute related records)
   * @param {*} record
   * @param {*} value
   */
  write(record, value) {
    return super.write(record, this.deserialize(record, value));
  }

  /**
   * Automatically create related records after creating the main record
   * @param {*} record
   */
  async post_create(record) {
    await super.post_create(record);
    const relatedRecords = record._changes[this.column] || record._data[this.column];
    if (relatedRecords && Array.isArray(relatedRecords)) {
      const batchInsert = [];
      for (const relatedRecord of relatedRecords) {
        relatedRecord[this.refFieldName] = record.id;
        const newRelatedRecord = this.refModel.create(relatedRecord);
        batchInsert.push(newRelatedRecord);
      }
      await Promise.all(batchInsert);
    }
  }

  serialize(record) {
    return undefined;
  }

  getColumnDefinition() {
    return null;
  }

  async buildPostIndex(metadata) {
    // no post index for one-to-many
    return false;
  }
}

ALIAS.forEach((alias) => {
  Field.behaviors[alias] = OneToMany;
});
export { OneToMany  };

import { Field, FieldDefinition } from './Base';
import { Model } from '../Model';
import { Record as ActiveRecord } from '../Record';

const ALIAS = ['onetomany', 'one-to-many', 'one2many'];

/**
 * One-to-many relationship field, exemple : comments in a Post model.
 */
class OneToMany extends Field {
  refModelName!: string;
  refFieldName!: string;

  constructor(model: Model, name: string, definition: FieldDefinition) {
    super(model, name, definition);
    if (!(this.definition as any).foreign) {
      throw new Error(`OneToMany field "${name}" requires a "foreign" definition`);
    }
    [this.refModelName, this.refFieldName] = String((this.definition as any).foreign).split('.');
    // Expose related model via a lazy getter to avoid early lookup before registration
    Object.defineProperty(this, 'refModel', {
      get: () => this.model.repo.get(this.refModelName),
      configurable: true,
      enumerable: false,
    });
    this.stored = false;
  }

  onChange(listener: (...args: any[]) => void): this {
    super.onChange(listener);
    (this.refModel as Model).on('create', listener);
    (this.refModel as Model).on('unlink', listener);
    return this;
  }

  getMetadata() {
    const meta: any = super.getMetadata();
    meta.foreign = (this.definition as any).foreign;
    meta.where = (this.definition as any).where;
    delete meta.index;
    delete meta.unique;
    delete meta.required;
    return meta;
  }

  isSameType(type: string): boolean {
    return ALIAS.indexOf(type) !== -1;
  }

  read(record: ActiveRecord): any {
    const result = super.read(record);
    if (!result) {
      let where: any = {};
      if (this.refFieldName) {
        where[this.refFieldName] = (record as any).id;
      }
      if ((this.definition as any).where) {
        if (typeof (this.definition as any).where === 'function') {
          where = (this.definition as any).where(record, this);
        } else {
          where = { ...where, ...(this.definition as any).where };
        }
      }
      const relatedRecords = (this.refModel as Model).where(where);

      relatedRecords.then((records: any[]) => {
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
  deserialize(record: ActiveRecord, value: any): any[] {
    if (!Array.isArray(value)) {
      value = [value];
    }
    return value.map((v: any) => {
      v[this.refFieldName] = record;
      return (this.refModel as Model).allocate(v);
    });
  }

  /**
   * Handling writes to one-to-many fields (to pre-compute related records)
   * @param {*} record
   * @param {*} value
   */
  write(record: ActiveRecord, value: any): ActiveRecord {
    return super.write(record, this.deserialize(record, value));
  }

  /**
   * Automatically create related records after creating the main record
   * @param {*} record
   */
  async post_create(record: ActiveRecord): Promise<void> {
    await super.post_create(record);
    const relatedRecords = record._changes[this.column] || record._data[this.column];
    if (relatedRecords && Array.isArray(relatedRecords)) {
      const batchInsert = [];
      for (const relatedRecord of relatedRecords) {
        relatedRecord[this.refFieldName] = (record as any).id;
        const newRelatedRecord = (this.refModel as Model).create(relatedRecord);
        batchInsert.push(newRelatedRecord);
      }
      await Promise.all(batchInsert);
    }
  }

  serialize(_record: ActiveRecord): any {
    return undefined;
  }

  getColumnDefinition(_table: any): any {
    return null;
  }

  async buildPostIndex(_metadata: any): Promise<boolean> {
    // no post index for one-to-many
    return false;
  }
}

ALIAS.forEach((alias) => {
  Field.behaviors[alias] = OneToMany;
});
export { OneToMany };

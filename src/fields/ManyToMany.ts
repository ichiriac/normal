// @ts-nocheck - TODO: Add proper type annotations
import { Field } from './Base';

const CollectionSymbol = Symbol('ManyToManyCollection');
const ALIAS = ['manytomany', 'many-to-many', 'many2many'];

/**
 * Helper class to manage many-to-many relationship collections.
 */
class CollectionWrapper {
  constructor(record, field) {
    this.record = record;
    this.field = field;
    this.cache = record._data[field.columns] || [];
  }

  /**
   * Add a related record to the collection.
   * @param {*} entityOrId
   */
  async add(entityOrId) {
    const targetId = typeof entityOrId === 'object' ? entityOrId.id : entityOrId;

    if (this.cache.includes(targetId)) {
      return; // already present
    }

    const row = {};
    row[this.field.left_col] = this.record.id;
    row[this.field.right_col] = targetId;
    await this.field.cnx(this.field.joinTable).insert(row);
    this.cache.push(targetId);
  }
  /**
   * Remove a related record from the collection.
   * @param {*} entityOrId
   */
  async remove(entityOrId) {
    const targetId = typeof entityOrId === 'object' ? entityOrId.id : entityOrId;
    const where = {};
    where[this.field.left_col] = this.record.id;
    where[this.field.right_col] = targetId;
    await this.field.cnx(this.field.joinTable).where(where).del();
    this.cache = this.cache.filter((id) => id !== targetId);
  }

  /**
   * Map over the related records.
   * @param {*} callback
   * @returns Array
   */
  async map(callback) {
    const records = await this.load();
    return Promise.all(records.map(callback));
  }

  /**
   * Retrieve all related records.
   * @returns Array<Record>
   */
  async load() {
    // Select target rows joined through the join table
    const rows = await this.field.refModel
      .query()
      .join(
        this.field.joinTable,
        `${this.field.refModel.table}.id`,
        `${this.field.joinTable}.${this.field.right_col}`
      )
      .where(`${this.field.joinTable}.${this.field.left_col}`, this.record.id)
      .select(`${this.field.refModel.table}.id`);
    this.cache = rows.map((r) => r.id);
    return await this.field.refModel.lookup(this.cache);
  }
  /**
   * Clear all relations in the collection.
   * @returns this
   */
  async clear() {
    const where = {};
    where[this.field.left_col] = this.record.id;
    await this.field.cnx(this.field.joinTable).where(where).del();
    this.cache = [];
    return this;
  }
}

class ManyToMany extends Field {
  constructor(model, name, definition) {
    super(model, name, definition);
    if (!this.definition.model) {
      throw new Error(`ManyToMany field "${name}" requires a model in its definition`);
    }
    this.refModel = this.model.repo.get(this.definition.model);
    this.stored = false;
  }

  get joinTable() {
    let joinTable = this.definition.joinTable;
    if (!joinTable) {
      if (this.model.table < this.refModel.table) {
        joinTable = 'rel_' + this.model.table + '_' + this.refModel.table;
      } else {
        joinTable = 'rel_' + this.refModel.table + '_' + this.model.table;
      }
    }
    return joinTable;
  }

  get cnx() {
    return this.model.repo.cnx;
  }

  get left_col() {
    return this.model.table + '_id';
  }

  get right_col() {
    return this.refModel.table + '_id';
  }

  write(record, value) {
    throw new Error('Cannot directly set a many-to-many relation field, use add or remove methods');
  }

  read(record) {
    if (!record[CollectionSymbol]) {
      record[CollectionSymbol] = new Map();
    }
    if (!record[CollectionSymbol].has(this.column)) {
      record[CollectionSymbol].set(this.column, new CollectionWrapper(record, this));
    }
    return record[CollectionSymbol].get(this.column);
  }

  async post_create(record) {
    await super.post_create(record);
    const ids = record._data[this.column];
    record._data[this.column] = [];
    if (ids && Array.isArray(ids) && ids.length > 0) {
      const collection = this.read(record);
      await Promise.all(ids.map((id) => collection.add(id)));
    }
  }

  serialize(record) {
    return undefined;
  }

  getMetadata() {
    const meta = super.getMetadata();
    meta.model = this.definition.model;
    return meta;
  }

  getColumnDefinition() {
    return null;
  }

  isSameType(type) {
    return ALIAS.indexOf(type) !== -1;
  }

  async buildPostIndex(metadata) {
    const exists = await this.cnx.schema.hasTable(this.joinTable);
    if (!exists) {
      await this.cnx.schema.createTable(this.joinTable, (table) => {
        const col1 = table
          .integer(this.left_col)
          .unsigned()
          .references('id')
          .inTable(this.model.table)
          .notNullable()
          .onDelete('CASCADE');
        const col2 = table
          .integer(this.right_col)
          .unsigned()
          .references('id')
          .inTable(this.refModel.table)
          .notNullable()
          .onDelete('CASCADE');
        table.primary([this.left_col, this.right_col]);
      });
      return true;
    }
    // @fixme: if any table was renamed, we should insert previous table rows and drop previous one !
    // @bug actually this code will cause a reset of the join table contents on any table name changes
    // to avoid this issue you should use the joinTable definition property to fix the join table name
    return false;
  }
}

ALIAS.forEach((alias) => {
  Field.behaviors[alias] = ManyToMany;
});
export { ManyToMany };

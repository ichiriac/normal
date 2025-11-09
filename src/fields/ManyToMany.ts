import { Field, FieldDefinition } from './Base';
import { Model } from '../Model';
import { Record as ActiveRecord } from '../Record';

const CollectionSymbol = Symbol('ManyToManyCollection');
const ALIAS = ['manytomany', 'many-to-many', 'many2many'];

/**
 * Helper class to manage many-to-many relationship collections.
 */
class CollectionWrapper {
  record: ActiveRecord;
  field: ManyToMany;
  cache: any[];
  constructor(record: ActiveRecord, field: ManyToMany) {
    this.record = record;
    this.field = field;
    this.cache = (record as any)._data[(field as any).columns] || [];
  }

  /**
   * Add a related record to the collection.
   * @param {*} entityOrId
   */
  async add(entityOrId: any): Promise<void> {
    const targetId = typeof entityOrId === 'object' ? entityOrId.id : entityOrId;

    if (this.cache.includes(targetId)) {
      return; // already present
    }

    const row: any = {};
  row[this.field.left_col] = (this.record as any).id;
    row[this.field.right_col] = targetId;
    await this.field.cnx(this.field.joinTable).insert(row);
    this.cache.push(targetId);
  }
  /**
   * Remove a related record from the collection.
   * @param {*} entityOrId
   */
  async remove(entityOrId: any): Promise<void> {
    const targetId = typeof entityOrId === 'object' ? entityOrId.id : entityOrId;
    const where: any = {};
  where[this.field.left_col] = (this.record as any).id;
    where[this.field.right_col] = targetId;
    await this.field.cnx(this.field.joinTable).where(where).del();
    this.cache = this.cache.filter((id) => id !== targetId);
  }

  /**
   * Map over the related records.
   * @param {*} callback
   * @returns Array
   */
  async map(callback: (r: any) => any): Promise<any[]> {
    const records = await this.load();
    return Promise.all(records.map(callback));
  }

  /**
   * Retrieve all related records.
   * @returns Array<Record>
   */
  async load(): Promise<ActiveRecord[]> {
    // Select target rows joined through the join table
    const rows: any[] = await (this.field.refModel.query() as any)
      .join(
        this.field.joinTable,
        `${this.field.refModel.table}.id`,
        `${this.field.joinTable}.${this.field.right_col}`
      )
      .where(`${this.field.joinTable}.${this.field.left_col}`, (this.record as any).id)
      .select(`${this.field.refModel.table}.id`);
    this.cache = rows.map((r: any) => r.id);
    return await this.field.refModel.lookup(this.cache);
  }
  /**
   * Clear all relations in the collection.
   * @returns this
   */
  async clear(): Promise<this> {
    const where: any = {};
  where[this.field.left_col] = (this.record as any).id;
    await this.field.cnx(this.field.joinTable).where(where).del();
    this.cache = [];
    return this;
  }
}

class ManyToMany extends Field {
  declare refModel: Model; // override base optional with concrete type
  constructor(model: Model, name: string, definition: FieldDefinition) {
    super(model, name, definition);
    if (!(this.definition as any).model) {
      throw new Error(`ManyToMany field "${name}" requires a model in its definition`);
    }
    this.refModel = this.model.repo.get((this.definition as any).model);
    this.stored = false;
  }

  get joinTable(): string {
    let joinTable = (this.definition as any).joinTable as string | undefined;
    if (!joinTable) {
      if (this.model.table < this.refModel.table) {
        joinTable = 'rel_' + this.model.table + '_' + this.refModel.table;
      } else {
        joinTable = 'rel_' + this.refModel.table + '_' + this.model.table;
      }
    }
    return joinTable;
  }

  get cnx(): any {
    return this.model.repo.cnx;
  }

  get left_col(): string {
    return this.model.table + '_id';
  }

  get right_col(): string {
    return this.refModel.table + '_id';
  }

  write(_record: ActiveRecord, _value: any): ActiveRecord {
    throw new Error('Cannot directly set a many-to-many relation field, use add or remove methods');
  }

  read(record: ActiveRecord): CollectionWrapper {
    const holder: any = record as any;
    if (!holder[CollectionSymbol]) {
      holder[CollectionSymbol] = new Map();
    }
    if (!holder[CollectionSymbol].has(this.column)) {
      holder[CollectionSymbol].set(this.column, new CollectionWrapper(record, this));
    }
    return holder[CollectionSymbol].get(this.column);
  }

  async post_create(record: ActiveRecord): Promise<void> {
    await super.post_create(record);
    const ids = record._data[this.column];
    record._data[this.column] = [];
    if (ids && Array.isArray(ids) && ids.length > 0) {
      const collection = this.read(record);
      await Promise.all(ids.map((id) => collection.add(id)));
    }
  }

  serialize(_record: ActiveRecord): any {
    return undefined;
  }

  getMetadata(): any {
    const meta: any = super.getMetadata();
    meta.model = (this.definition as any).model;
    delete meta.index;
    return meta;
  }

  getColumnDefinition(_table: any): any {
    return null;
  }

  isSameType(type: string): boolean {
    return ALIAS.indexOf(type) !== -1;
  }

  async buildPostIndex(_metadata: any): Promise<boolean> {
    const exists = await this.cnx.schema.hasTable(this.joinTable);
    if (!exists) {
      await this.cnx.schema.createTable(this.joinTable, (table: any) => {
        table
          .integer(this.left_col)
          .unsigned()
          .references('id')
          .inTable(this.model.table)
          .notNullable()
          .onDelete('CASCADE');
        table
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

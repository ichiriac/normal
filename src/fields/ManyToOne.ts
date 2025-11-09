import { Field, FieldDefinition } from './Base';
import { Model } from '../Model';
import { Record as ActiveRecord } from '../Record';

const ALIAS = ['manytoone', 'many-to-one', 'many2one'];

/**
 * Many-to-one relationship field, exemple : author in a Post model.
 * @extends Field
 */
class ManyToOne extends Field {
  refModel?: Model;
  constructor(model: Model, name: string, definition: FieldDefinition) {
    super(model, name, definition);
    if (!(definition as any).model) {
      throw new Error(`ManyToOne field '${name}' requires a 'model' definition`);
    }
    try {
      this.refModel = model.repo.get((definition as any).model);
    } catch (err) {
      throw new Error(
        `ManyToOne field '${name}' from model '${model.name}' references unknown model '${(definition as any).model}'`
      );
    }
  }

  write(record: ActiveRecord, value: any): ActiveRecord {
    if (value && typeof value === 'object' && value.id !== undefined) {
      return super.write(record, value.id);
    } else {
      return super.write(record, value);
    }
  }

  read(record: ActiveRecord): any {
    const value = super.read(record);
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'object') {
      return (this.refModel as Model).allocate(value);
    }
    return (this.refModel as Model).allocate({ id: value });
  }

  serialize(record: ActiveRecord): any {
    return super.read(record);
  }

  getMetadata(): any {
    const meta: any = super.getMetadata();
    meta.model = (this.definition as any).model;
    meta.cascade = (this.definition as any).cascade;
    meta.where = (this.definition as any).where;
    // index flag irrelevant for relation fields
    delete (meta as any).index;
    return meta;
  }

  isSameType(type: string): boolean {
    return ALIAS.indexOf(type) !== -1;
  }

  // Accept an optional table param for interface compatibility
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getColumnDefinition(_table?: any): any {
    return null;
  }

  /**
   * Create the foreign key column for this many-to-one relation.
   * @param {*} table
   * @param {*} metadata
   * @returns
   */
  async buildPostIndex(metadata: any): Promise<boolean> {
    // inject creation behavior
    (this as any).getColumnDefinition = (table: any): any => {
      const col = table
        .integer(this.column)
        .unsigned()
        .references('id')
        .inTable((this.refModel as Model).table);
      if ((this.definition as any).cascade === true) {
        col.onDelete('CASCADE');
      } else if ((this.definition as any).cascade === false) {
        col.onDelete('SET NULL');
      }
      return col;
    };
    let changed = false;
    await this.cnx.schema.table(this.model.table, (table: any) => {
      changed = this.buildColumn(table, metadata);
    });
    (this as any).getColumnDefinition = (): any => null;
    return changed;
  }
}

ALIAS.forEach((alias) => {
  Field.behaviors[alias] = ManyToOne;
});
export { ManyToOne };

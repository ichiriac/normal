import { Field, FieldDefinition } from './Base';
import { Record as ActiveRecord } from '../Record';
import { Model } from '../Model';

/**
 * Reference field type.
 * @extends Field
 */
class Reference extends Field {
  id_column: string;
  models: string[];

  constructor(
    model: Model,
    name: string,
    definition: FieldDefinition & { id_column?: string; models?: string[] }
  ) {
    super(model, name, definition);
    this.id_column = (definition as any).id_column || 'id';
    this.models = (definition as any).models || [];
  }

  write(record: ActiveRecord, value: any): ActiveRecord {
    return super.write(record, value);
  }

  read(record: ActiveRecord): any {
    return super.read(record);
  }

  getMetadata(): any {
    const meta: any = super.getMetadata();
    meta.id_column = this.id_column;
    meta.models = this.models;
    // reference is stored; index/unique decided by modeler; leave as-is
    return meta;
  }

  getColumnDefinition(): any {
    return null;
  }

  async buildPostIndex(metadata: any): Promise<boolean> {
    // inject creation behavior
    (this as any).getColumnDefinition = (table: any) => {
      if (this.models.length > 0) {
        return table.enum(this.column, this.models);
      } else {
        return table.string(this.column);
      }
    };
    let changed = false;
    await this.cnx.schema.table(this.model.table, (table: any) => {
      changed = this.buildColumn(table, metadata);
      const indexChange = this.buildIndex(table, metadata);
      if (indexChange) {
        changed = true;
      }
    });
    (this as any).getColumnDefinition = () => null;
    return changed;
  }
}

Field.behaviors.reference = Reference;
export { Reference };

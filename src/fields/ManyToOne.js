const { Field } = require('./Base');

const ALIAS = ['manytoone', 'many-to-one', 'many2one'];

/**
 * Many-to-one relationship field, exemple : author in a Post model.
 * @extends Field
 */
class ManyToOne extends Field {
  constructor(model, name, definition) {
    super(model, name, definition);
    if (!definition.model) {
      throw new Error(`ManyToOne field '${name}' requires a 'model' definition`);
    }
    try {
      this.refModel = model.repo.get(definition.model);
    } catch (err) {
      throw new Error(
        `ManyToOne field '${name}' from model '${model.name}' references unknown model '${definition.model}'`
      );
    }
  }

  write(record, value) {
    if (value && typeof value === 'object' && value.id !== undefined) {
      return super.write(record, value.id);
    } else {
      return super.write(record, value);
    }
  }

  read(record) {
    const value = super.read(record);
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'object') {
      return this.refModel.allocate(value);
    }
    return this.refModel.allocate({ id: value });
  }

  serialize(record) {
    return super.read(record);
  }

  getMetadata() {
    const meta = super.getMetadata();
    meta.model = this.definition.model;
    meta.cascade = this.definition.cascade;
    meta.where = this.definition.where;
    delete meta.index;
    return meta;
  }

  isSameType(type) {
    return ALIAS.indexOf(type) !== -1;
  }

  getColumnDefinition() {
    return null;
  }

  /**
   * Create the foreign key column for this many-to-one relation.
   * @param {*} table
   * @param {*} metadata
   * @returns
   */
  async buildPostIndex(metadata) {
    // inject creation behavior
    this.getColumnDefinition = (table) => {
      const col = table.integer(this.name).unsigned().references('id').inTable(this.refModel.table);
      if (this.definition.cascade === true) {
        col.onDelete('CASCADE');
      } else if (this.definition.cascade === false) {
        col.onDelete('SET NULL');
      }
      return col;
    };
    let changed = false;
    await this.cnx.schema.table(this.model.table, (table) => {
      changed = this.buildColumn(table, metadata);
    });
    this.getColumnDefinition = () => {
      return null;
    };
    return changed;
  }
}

ALIAS.forEach((alias) => {
  Field.behaviors[alias] = ManyToOne;
});
module.exports = { ManyToOne };

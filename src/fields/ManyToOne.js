
const { Field } = require('./Base');

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
        this.definition.refModel = model.repo.get(definition.model);
    }

    write(record, value) {
        if (value && typeof value === "object" && value.id !== undefined) {
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
        return this.definition.refModel.allocate({ id: value });
    }

    serialize(record) {
        const value = this.read(record);
        if (value && value.id !== undefined) {
            return value.id;
        }
        return null;
    }

    column(table) {
        // do nothing here; handled in onIndex
    }

    onIndex(table) {
        const col = table.integer(this.name).unsigned().references('id').inTable(
            this.definition.refModel.table
        );
        if (this.definition.required) {
            col.notNullable();
        } else {
            col.nullable();
        }
        if (this.definition.cascade) {
            col.onDelete('CASCADE');
        } else {
            col.onDelete('SET NULL');
        }
        return col;
    }
}

Field.behaviors.manytoone = ManyToOne;
Field.behaviors['many-to-one'] = ManyToOne;
Field.behaviors['many2one'] = ManyToOne;

module.exports = { ManyToOne };
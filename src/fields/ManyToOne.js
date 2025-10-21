
const { Field } = require('./Base');

const ALIAS = [
    'manytoone',
    'many-to-one',
    'many2one'
];

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
        this.refModel = model.repo.get(definition.model);
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
        return this.refModel.allocate({ id: value });
    }

    serialize(record) {
        const value = this.read(record);
        if (value && value.id !== undefined) {
            return value.id;
        }
        return null;
    }

    /**
     * Check if the column changed his type, and drop it if so.
     * @param {*} table 
     * @param {*} metadata 
     * @param {*} columnCallback 
     */
    async buildColumn(table, metadata, columnCallback) {
        if (metadata && ALIAS.indexOf(metadata.type) !== -1) {
            const exists = await this.cnx.schema.hasColumn(this.model.table,metadata.column);
            if (exists) {
                await table.dropColumn(metadata.column);
            }
        }
    }

    getMetadata() {
        const meta = super.getMetadata();
        meta.model = this.definition.model;
        meta.cascade = this.definition.cascade;
        delete meta.index;
        return meta;
    }

    /**
     * Create the foreign key column for this many-to-one relation.
     * @param {*} table 
     * @param {*} metadata 
     * @returns 
     */
    async buildIndex(table, metadata) {
        const wrapper = () => {
            const col = table.integer(this.name).unsigned().references('id').inTable(
                this.refModel.table
            );
            if (this.definition.unique) {
                col.unique();
            }
            if (this.definition.required) {
                col.notNullable();
            } else {
                col.nullable();
            }
            if (this.definition.cascade === true) {
                col.onDelete('CASCADE');
            } else if (this.definition.cascade === false) {
                col.onDelete('SET NULL');
            }
            return col;
        };
        if (!metadata) {
            wrapper();
            return true;
        }

        let meta_changed = false;
        if (this.column !== metadata.column) {
            table.renameColumn(metadata.column, this.column);
            meta_changed = true;
        }
        
        let changed = false;
        for(let k in this.definition) {
            if (k === 'column') continue;
            if (k === 'type') continue;
            if (this.definition[k] !== metadata[k]) {
                changed = true;
                break;
            }
        }
        if (changed) {
            await this.replaceColumn(table, this.column, wrapper);
            meta_changed = true;
        }
        return meta_changed;
    }
}

ALIAS.forEach(alias => {
    Field.behaviors[alias] = ManyToOne;
});
module.exports = { ManyToOne };
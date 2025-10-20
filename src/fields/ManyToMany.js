
const { Field } = require('./Base');

const CollectionSymbol = Symbol('ManyToManyCollection');

/**
 * Helper class to manage many-to-many relationship collections.
 */
class CollectionWrapper {

    constructor(record, field) {
        this.record = record;
        this.field = field;
        this.cache = record._data[field.name] || [];
    }

    /**
     * Add a related record to the collection.
     * @param {*} entityOrId 
     */
    async add(entityOrId) {
        const targetId =
          typeof entityOrId === "object" ? entityOrId.id : entityOrId;

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
        const targetId =
          typeof entityOrId === "object" ? entityOrId.id : entityOrId;
        const where = {};
        where[this.field.left_col] = this.record.id;
        where[this.field.right_col] = targetId;
        await this.field.cnx(this.field.joinTable).where(where).del();
        this.cache = this.cache.filter(id => id !== targetId);
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
        const rows = await this.field.relModel.query()
          .join(this.field.joinTable, `${this.field.relModel.table}.id`, `${this.field.joinTable}.${this.field.right_col}`)
          .where(`${this.field.joinTable}.${this.field.left_col}`, this.record.id)
          .select(`${this.field.relModel.table}.id`);
        this.cache = rows.map(r => r.id);
        return await this.field.relModel.lookup(this.cache);
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
        this.relModel = this.model.repo.get(this.definition.model);
    }

    get joinTable() {
        let joinTable = this.definition.joinTable;
        if (!joinTable) {
            if (this.model.table < this.relModel.table) {
                joinTable = 'rel_' + this.model.table + '_' + this.relModel.table;
            } else {
                joinTable = 'rel_' + this.relModel.table + '_' + this.model.table;
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
        return this.relModel.table + '_id';
    }

    write(record, value) {
        throw new Error("Cannot directly set a many-to-many relation field, use add or remove methods");
    }

    read(record) {
        if (!record[CollectionSymbol]) {
            record[CollectionSymbol] = new Map();
        }
        if (!record[CollectionSymbol].has(this.name)) {
            record[CollectionSymbol].set(this.name, new CollectionWrapper(record, this));
        }
        return record[CollectionSymbol].get(this.name);
    }

    serialize(record) {
        return undefined;
    }

    column(table) {
        // do nothing here; handled in onIndex
    }

    async onIndex(table) {
        const exists = await this.cnx.schema.hasTable(this.joinTable);
        if (!exists) {
            await this.cnx.schema.createTable(this.joinTable, (table) => {
                const col1 = table.integer(this.left_col).unsigned().references('id').inTable(
                    this.model.table
                ).notNullable().onDelete('CASCADE');
                const col2 = table.integer(this.right_col).unsigned().references('id').inTable(
                    this.relModel.table
                ).notNullable().onDelete('CASCADE');
                table.primary([this.left_col, this.right_col]);
            });
        }
    }
}

Field.behaviors.manytomany = ManyToMany;
Field.behaviors['many-to-many'] = ManyToMany;
Field.behaviors['many2many'] = ManyToMany;
module.exports = { ManyToMany };
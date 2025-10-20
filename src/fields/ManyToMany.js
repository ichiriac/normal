
const { Field } = require('./Base');

/**
 * Helper class to manage many-to-many relationship collections.
 */
class CollectionWrapper {

    constructor(record, field) {
        this.record = record;
        this.field = field;
    }
    /**
     * Add a related record to the collection.
     * @param {*} entityOrId 
     */
    async add(entityOrId) {
        const targetId =
          typeof entityOrId === "object" ? entityOrId.id : entityOrId;
        const row = {};
        row[this.field.left_col] = this.record.id;
        row[this.field.right_col] = targetId;
        await this.field.cnx(this.field.joinTable).insert(row);
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
    }
    /**
     * Retrieve all related records.
     * @returns 
     */
    async load() {
        // Select target rows joined through the join table
        const rows = await this.field.definition.refModel.query()
          .join(this.field.joinTable, `${this.field.definition.refModel.table}.id`, `${this.field.joinTable}.${this.field.right_col}`)
          .where(`${this.field.joinTable}.${this.field.left_col}`, this.record.id)
          .select(`${this.field.definition.refModel.table}.id`);
        return await this.field.definition.refModel.lookup(rows.map((row) => row.id));
    }
    /**
     * Clear all relations in the collection.
     */
    async clear() {
        const where = {};
        where[this.field.left_col] = this.record.id;
        await this.field.cnx(this.field.joinTable).where(where).del();
    }
}

class ManyToMany extends Field {

    get joinTable() {
        let joinTable = this.definition.joinTable;
        if (!joinTable) {
            if (this.model.table < this.definition.refModel.table) {
                joinTable = 'rel_' + this.model.table + '_' + this.definition.refModel.table;
            } else {
                joinTable = 'rel_' + this.definition.refModel.table + '_' + this.model.table;
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
        return this.definition.refModel.table + '_id';
    }

    write(record, value) {
        throw new Error("Cannot directly set a many-to-many relation field, use add or remove methods");
    }

    read(record) {
        return new CollectionWrapper(record, this);
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
                    this.definition.refModel.table
                ).notNullable().onDelete('CASCADE');
                table.primary([this.left_col, this.right_col]);
            });
        }
    }
}

Field.behaviors.manytomany = ManyToMany;
Field.behaviors['many-to-many'] = ManyToMany;

module.exports = { ManyToMany };
class Field {

    static behaviors = {};

    /**
     * Build a field instance based on its definition.
     * @param {*} model 
     * @param {*} name 
     * @param {*} definition 
     * @returns 
     */
    static define(model, name, definition) {
        const fieldType = definition.type ? definition.type.toLowerCase() : null;
        if (fieldType && Field.behaviors.hasOwnProperty(fieldType)) {
            const BehaviorClass = Field.behaviors[fieldType];
            return new BehaviorClass(model, name, definition);
        }
        return new Field(model, name, definition);
    }

    /**
     * Initialize a new field.
     * @param {*} model 
     * @param {*} name 
     * @param {*} definition 
     */
    constructor(model, name, definition) {
        this.model = model;
        this.name = name;
        this.definition = definition;
    }

    /**
     * Attach the field to a record prototype.
     * @param {*} proto 
     */
    attach(cls) {
        const self = this;
        Object.defineProperty(cls.prototype, this.name, {
            get: function() {
                return self.read(this);
            },
            set: function(value) {
                self.write(this, value);
            }
        });
        cls.fields = cls.fields || {};
        cls.fields[this.name] = this;
    }

    /**
     * Method used to write the field value to a record.
     * @param {Record} record 
     * @param {*} value 
     * @returns 
     */
    write(record, value) {
        if (record._data[this.name]=== value) {
            delete record._changes[this.name];
            record._isDirty = Object.keys(record._changes).length > 0;
        } else {
            record._changes[this.name] = value;
            record._isDirty = true;
        }
        return record;
    }

    /**
     * Method used to read the field value from a record.
     * @param {Record} record 
     * @returns 
     */
    read(record) {
        if (record._changes.hasOwnProperty(this.name)) {
            return record._changes[this.name];
        }
        
        if (record._data.hasOwnProperty(this.name)) {
            return record._data[this.name];
        }
        if (this.definition.default !== undefined) {
            if (typeof this.definition.default === 'function') {
                return this.definition.default();
            }
            return this.definition.default;
        }
        return null;
    }

    /**
     * Method used to serialize the field value for storage.
     * @param {*} record 
     * @returns 
     */
    serialize(record) {
        return this.read(record);
    }

    /**
     * Method that initializes the database column for this field.
     * @param {*} table 
     */
    column(table) {
        // Field not stored by default
    }

    /**
     * Method that initializes indexes for this field.
     * @param {*} table 
     */
    onIndex(table) {
        if (this.definition.index) {
            table.index(this.name);
        }
        if (this.definition.unique) {
            table.unique(this.name);
        }        
    }
}

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

/**
 * One-to-many relationship field, exemple : comments in a Post model.
 */
class OneToMany extends Field {

    serialize(record) {
        return undefined;
    }

    onIndex(table) {
        // do nothing here; handled in onIndex of ManyToOne
    }

    column(table) {
        // do nothing here; handled in onIndex of ManyToOne
    }
}

/**
 * Many-to-one relationship field, exemple : author in a Post model.
 * @extends Field
 */
class ManyToOne extends Field {

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
        if (this.definition.refModel) {
            return this.definition.refModel.allocate({ id: value });
        }   
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

class DateField extends Field {
    write(record, value) {
        if (value instanceof Date) {
            return super.write(record, value);
        } else if (typeof value === "string" || typeof value === "number") {
            const date = new Date(value);
            if (isNaN(date.getTime())) {
                throw new Error(`Invalid date value for field ${this.name}: ${value}`);
            }
            return super.write(record, date);
        } else if (value === null || value === undefined) {
            return super.write(record, null);
        } else {
            throw new Error(`Invalid type for date field ${this.name}: ${typeof value}`);
        }
    }

    read(record) {
        const value = super.read(record);
        if (value === null || value === undefined) {
            return null;
        }
        return new Date(value);
    }

    serialize(record) {
        const value = this.read(record);
        if (value instanceof Date) {
            return value.toISOString();
        }
        return null;
    }

    column(table) {
        const col = table.date(this.name);
        if (this.definition.required) {
            col.notNullable();
        } else {
            col.nullable();
        }
        return col;
    }
}

class DateTimeField extends Field {
    write(record, value) {
        if (value instanceof Date) {
            return super.write(record, value);
        }
        else if (typeof value === "string" || typeof value === "number") {
            const date = new Date(value);  
            if (isNaN(date.getTime())) {
                throw new Error(`Invalid datetime value for field ${this.name}: ${value}`);
            }
            return super.write(record, date);
        } else if (value === null || value === undefined) {
            return super.write(record, null);
        } else {
            throw new Error(`Invalid type for datetime field ${this.name}: ${typeof value}`);
        }
    }
    read(record) {
        const value = super.read(record);
        if (value === null || value === undefined) {
            return null;
        }
        return new Date(value);
    }
    serialize(record) {
        const value = this.read(record);
        if (value instanceof Date) {
            return value.getTime();
        }
        return null;
    }
    column(table) {
        return table.timestamp(this.name, { useTz: false });
    }
}

class BooleanField extends Field {
    write(record, value) {
        return super.write(record, Boolean(value));
    }
    read(record) {
        const value = super.read(record);
        return Boolean(value);
    }
    serialize(record) {
        const value = this.read(record);
        return value ? 1 : 0;
    }
    column(table) {
        return table.boolean(this.name);
    }
}

class EnumField extends Field {
    constructor(model, name, definition) {
        super(model, name, definition);
        if (!definition.values || !Array.isArray(definition.values)) {
            throw new Error(`Enum field ${name} must have a 'values' array in its definition`);
        }
        this.values = definition.values;
    }

    write(record, value) {
        if (!this.values.includes(value)) {
            throw new Error(`Invalid value for enum field ${this.name}: ${value}`);
        }
        return super.write(record, value);
    }

    read(record) {
        const value = super.read(record);
        if (!this.values.includes(value)) {
            throw new Error(`Invalid value for enum field ${this.name}: ${value}`);
        }
        return value;
    }
    column(table) {
        return table.enum(this.name, this.values);
    }
}

class Primary extends Field {

    /**
     * Sets the primary key value on the record.
     * @param {*} record 
     * @param {*} value 
     * @returns 
     */
    write(record, value) {
        if (record._data.hasOwnProperty(this.name)) {
            throw new Error(`Cannot modify primary key field ${this.name}`);
        }
        record._data[this.name] = value;
        this.model.entities.set(value, record);
        return record;
    }

    read(record) {
        return record._data[this.name];
    }

    column(table) {
        return table.increments(this.name).primary();
    }
}

class StringField extends Field {
    write(record, value) {
        return super.write(record, String(value));
    }
    read(record) {
        const value = super.read(record);
        if (value === null || value === undefined) {
            return null;
        }
        return String(value);
    }
    serialize(record) {
        const value = this.read(record);
        if (value === null || value === undefined) {
            return null;
        }
        return String(value);
    }
    column(table) {
        const length = this.definition.length || 255;
        return table.string(this.name, length);
    }
}

class TextField extends Field {
    write(record, value) {
        return super.write(record, String(value));
    }
    read(record) {
        const value = super.read(record);
        if (value === null || value === undefined) {
            return null;
        }
        return String(value);
    }
    serialize(record) {
        const value = this.read(record);
        if (value === null || value === undefined) {
            return null;
        }
        return String(value);
    }
    column(table) {
        return table.text(this.name);
    }
}

class IntegerField extends Field {
    write(record, value) {
        const intValue = parseInt(value, 10);
        if (isNaN(intValue)) {
            throw new Error(`Invalid integer value for field ${this.name}: ${value}`);
        }
        return super.write(record, intValue);
    }
    read(record) {
        const value = super.read(record);   
        if (value === null || value === undefined) {
            return null;
        }   
        return parseInt(value, 10);
    }
    serialize(record) {
        const value = this.read(record);
        if (value === null || value === undefined) {
            return null;
        }
        return parseInt(value, 10);
    }
    column(table) {
        const column = table.integer(this.name);
        if (this.definition.unsigned) {
            column.unsigned();
        }
        return column;
    }
}

class FloatField extends Field {
    write(record, value) {
        const floatValue = parseFloat(value);
        if (isNaN(floatValue)) {
            throw new Error(`Invalid float value for field ${this.name}: ${value}`);
        }
        return super.write(record, floatValue);
    }
    read(record) {
        const value = super.read(record);
        if (value === null || value === undefined) {
            return null;
        }
        return parseFloat(value);
    }
    serialize(record) {
        const value = this.read(record);
        if (value === null || value === undefined) {
            return null;
        }
        return parseFloat(value);
    }
    column(table) {
        const column = table.float(this.name);
        if (this.definition.unsigned) {
            column.unsigned();
        }
        if (this.definition.precision && this.definition.scale) {
            column.precision(this.definition.precision, this.definition.scale);
        }
        return column;
    }
}

Field.behaviors.primary = Primary;
Field.behaviors.boolean = BooleanField; 
Field.behaviors.date = DateField;
Field.behaviors.datetime = DateTimeField;
Field.behaviors.timestamp = DateTimeField;
Field.behaviors.string = StringField;
Field.behaviors.text = TextField;
Field.behaviors.enum = EnumField;
Field.behaviors.integer = IntegerField;
Field.behaviors.float = FloatField;
Field.behaviors.manytoone = ManyToOne;
Field.behaviors.onetomany = OneToMany;
Field.behaviors.manytomany = ManyToMany;
Field.behaviors['many-to-one'] = ManyToOne;
Field.behaviors['one-to-many'] = OneToMany;
Field.behaviors['many-to-many'] = ManyToMany;

module.exports = { Field, ManyToMany, DateField, OneToMany, ManyToOne };
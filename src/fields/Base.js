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
        if (typeof definition === 'string') {
            definition = { type: definition.toLowerCase() };
        }
        if (definition instanceof Field) {
            definition = definition.definition; 
        }
        const fieldType = definition.type ? definition.type : null;
        if (fieldType && Field.behaviors.hasOwnProperty(fieldType)) {
            const BehaviorClass = Field.behaviors[fieldType];
            return new BehaviorClass(model, name, definition);
        } else {
            throw new Error(`Unknown field type: ${definition.type} for field ${name} in model ${model.name}`);
        }
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
        this.type = definition.type;
        this.column = definition.column || name;
        this.stored = definition.stored !== false;
        const allowed_keys = Object.keys(this.getMetadata());
        for (let key of Object.keys(definition)) {
            if (!allowed_keys.includes(key)) {
                throw new Error(
                    `Unknown field definition key '${key}' for field '${name}' in model '${model.name}'`
                );
            }
        }
        Object.freeze(this.definition);
    }

    /**
     * Attach the field to a record prototype.
     * @param {*} proto 
     */
    attach(model, cls) {
        const self = this;
        Object.defineProperty(cls.prototype, this.name, {
            get: function() {
                return self.read(this);
            },
            set: function(value) {
                self.write(this, value);
            },
            configurable: true,
            enumerable: true
        });
        model.fields = model.fields || {};
        model.fields[this.name] = this;
    }

    /**
     * Get the database connection.
     * @returns Knex instance
     */
    get cnx() {
        return this.model.repo.cnx;
    }

    /**
     * Get the repository.
     * @returns Repository instance
     */
    get repo() {
        return this.model.repo;
    }

    /**
     * Method used to write the field value to a record.
     * @param {Record} record 
     * @param {*} value 
     * @returns 
     */
    write(record, value) {
        if (record._data[this.column] === value) {
            delete record._changes[this.column];
            record._isDirty = Object.keys(record._changes).length > 0;
        } else {
            record._changes[this.column] = value;
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
        if (record._changes.hasOwnProperty(this.column)) {
            return record._changes[this.column];
        }

        if (record._data.hasOwnProperty(this.column) && record._data[this.column] !== null) {
            return record._data[this.column];
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
     * Checks if the specified type is the same
     * @param {*} value 
     * @returns 
     */
    isSameType(type) {
        return this.type === type;
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
     * Deserialize value from storage.
     * @param {*} value 
     * @returns 
     */
    deserialize(record, value) {
        return value;
    }

    getMetadata() {
        const meta = {
            column: this.column,
            type: this.definition.type,
            stored: this.stored,
            required: !!this.definition.required,
            unique: !!this.definition.unique,
            index: !!this.definition.index,
            default: undefined
        };

        if (this.definition.default !== undefined && typeof this.definition.default !== 'function') {
            meta.default = this.definition.default;
        }
        return meta;
    }

    /**
     * Get the column definition for this field.
     * @param {*} table 
     * @returns 
     */
    getColumnDefinition(table) {
        throw new Error('getColumnDefinition method not implemented for field type ' + this.definition.type);
    }

    /**
     * Get the column definition and apply common constraints.
     * @param {*} table 
     * @returns 
     */
    getBuilderColumn(table) {
        const column = this.getColumnDefinition(table);
        if (!column) return null;
        if (this.definition.required) {
            column.notNullable();
        } else {
            column.nullable();
        }
        if (this.definition.unique) {
            column.unique();
        }
        if (this.definition.default !== undefined && typeof this.definition.default !== 'function') {
            column.defaultTo(this.definition.default);
        }
        return column;
    }

    /**
     * Method that initializes the database column for this field.
     * @param {*} table 
     */
    buildColumn(table, metadata) {
        if (!metadata) {
            return !!this.getBuilderColumn(table);
        }
        if (this.column !== metadata.column) {
            table.renameColumn(metadata.column, this.column);
            return true;
        }
        return false;
    }

    /**
     * Checks if the field definition has changed.
     * @param {*} metadata 
     * @returns 
     */
    isDefChanged(metadata) {
        if (!metadata) return true;
        const definition = this.getMetadata();
        for(let k in definition) {
            if (k === 'column') continue;
            if (k === 'default' && typeof definition[k] === 'function') continue;
            if (k === 'index') continue;
            if (definition[k] != metadata[k]) {
                return true;
            }
        }
        return false;
    }

    /**
     * Replace a column while migrating data.
     * @param {*} table 
     * @param {*} name 
     * @param {*} columnCallback 
     * @returns 
     */
    async replaceColumn() {
        const mig_suffix = '_mig_tmp';
        const name = this.column;
        const exists = await this.cnx.schema.queryContext({ ignore: true }).hasColumn(this.model.table, name + mig_suffix);
        await this.cnx.schema.table(this.model.table, async (table) => {
            if (exists) {
                table.dropColumn(name + mig_suffix);
            }
            table.renameColumn(name, name + mig_suffix);
        });
        await this.cnx.schema.table(this.model.table, async (table) => {
            this.getBuilderColumn(table);
        });

        try {
            await this.cnx.raw(`UPDATE ${this.model.table} SET ${name} = ${name + mig_suffix}`);
            return true;
        } catch (err) {
            console.warn(`Warning: unable to migrate contents from ${name}`);
            return false;
        }
    }

    /**
     * Method that initializes indexes for this field.
     * @param {*} table 
     */
    buildIndex(table, metadata) {
        const prevNotIndexed = !metadata || !metadata.index;
        if (this.definition.index) {
            if (prevNotIndexed) {
                table.index(this.column);
                return true;
            }
        } else if (prevNotIndexed === false) {
            table.dropIndex(this.column);
            return true
        }
        return false;
    }

    /**
     * Run table post-processing after initial build, usefull for
     * manipulating columns or defining foreign keys.
     * @param {*} metadata 
     * @returns 
     */
    async buildPostIndex(metadata) {
        if (metadata && this.isDefChanged(metadata)) {
            await this.replaceColumn();
            return true;
        }
        return false;
    }

    async post_create(record) {
        // Hook after record creation
    }

    async pre_create(record) {
        // Hook before record creation
    }

    async pre_update(record) {
        // Hook before record update
    }

    async post_update(record) {
        // Hook after record update
    }

    async pre_delete(record) {
        // Hook before record deletion
    }

    async post_delete(record) {
        // Hook after record deletion
    }


}

module.exports = { Field };
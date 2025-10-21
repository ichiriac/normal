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
            definition = { type: definition };
        }
        if (definition instanceof Field) {
            definition = definition.definition; 
        }
        const fieldType = definition.type ? definition.type.toLowerCase() : null;
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
        this.column = definition.column || name;
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
    attach(cls) {
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

        if (record._data.hasOwnProperty(this.column)) {
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
            required: !!this.definition.required,
            unique: !!this.definition.unique,
            index: !!this.definition.index
        };

        if (this.definition.default !== undefined && typeof this.definition.default !== 'function') {
            meta.default = this.definition.default;
        }
        return meta;
    }

    /**
     * Method that initializes the database column for this field.
     * @param {*} table 
     */
    async buildColumn(table, metadata, columnCallback) {

        if (!columnCallback) return false;

        const wrapper = () => {
            const column = columnCallback();
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

        if (!metadata) {
            wrapper();
            return true;
        }

        let changed = false;

        if (this.column !== metadata.column) {
            table.renameColumn(metadata.column, this.column);
            changed = true;
        }

        let def_changed = false;
        for(let k in this.definition) {
            if (k === 'column') continue;
            if (k === 'default' && typeof this.definition[k] === 'function') continue;
            if (k === 'index') continue;
            if (this.definition[k] !== metadata[k]) {
                def_changed = true;
                break;
            }
        }

        if (def_changed) {
            await this.replaceColumn(table, this.column, wrapper);
            changed = true;
        }
        return changed;
    }

    /**
     * Replace a column while migrating data.
     * @param {*} table 
     * @param {*} name 
     * @param {*} columnCallback 
     * @returns 
     */
    async replaceColumn(table, name, columnCallback) {
        const mig_suffix = '_mig_tmp';
        const exists = await this.cnx.schema.hasColumn(this.model.table, name + mig_suffix);
        if (!exists) {
            table.renameColumn(name, name + mig_suffix);
        } else {
            table.dropColumn(name);
        }
        columnCallback();
        try {
            await table.raw(`UPDATE ${this.model.table} SET ${name} = ${name + mig_suffix}`);
            table.dropColumn(name + mig_suffix);
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
    async buildIndex(table, metadata) {
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
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

module.exports = { Field };
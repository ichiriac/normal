class Field {

    static behaviors = {};

    static define(model, name, definition) {
        if (definition.type && Field.behaviors.hasOwnProperty(definition.type)) {
            const BehaviorClass = Field.behaviors[definition.type];
            return new BehaviorClass(model, name, definition);
        }
        return new Field(model, name, definition);
    }

    static reference(model, name, refModel) {
        return new ManyToOne(model, name, { type: "manyToOne", refModel });
    }

    static relation(model, name, refModel, joinTable) {
        return new OneToMany(model, name, { type: "oneToMany", refModel, joinTable });
    }

    static many(model, name, refModel, joinTable) {
        return new ManyToMany(model, name, { type: "manyToMany", refModel, joinTable });
    }

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
        return record._data[this.name];
    }

    /**
     * Method used to serialize the field value for storage.
     * @param {*} record 
     * @returns 
     */
    serialize(record) {
        return this.read(record);
    }
}

class ManyToMany extends Field {
    add() {
        throw new Error("Not implemented");
    }

    remove() {
        throw new Error("Not implemented");
    }

    load() {
        throw new Error("Not implemented");
    }

    clear() {
        throw new Error("Not implemented");
    }

    async write(record, value) {
        throw new Error("Not implemented");
    }

    async read(record) {
        throw new Error("Not implemented");
    }

    serialize(record) {
        return undefined;
    }
}

class OneToMany extends Field {
    serialize(record) {
        return undefined;
    }
}

class ManyToOne extends Field {
    serialize(record) {
        const value = this.read(record);
        if (value && value.id !== undefined) {
            return value.id;
        }
        return null;
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
}

Field.behaviors.boolean = BooleanField; 
Field.behaviors.date = DateField;
Field.behaviors.manyToOne = ManyToOne;
Field.behaviors.oneToMany = OneToMany;
Field.behaviors.enum = EnumField;
Field.behaviors.manyToMany = ManyToMany;

module.exports = { Field, ManyToMany, DateField, OneToMany, ManyToOne };
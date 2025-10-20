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

    async write(record, value) {
        if (record._data[this.name]=== value) {
            delete record._changes[this.name];
            record._isDirty = Object.keys(record._changes).length > 0;
        } else {
            record._changes[this.name] = value;
            record._isDirty = true;
        }
        return record;
    }

    async read(record) {
        if (record._changes.hasOwnProperty(this.name)) {
            return record._changes[this.name];
        }
        return record._data[this.name];
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
}

class OneToMany extends Field {

}

class ManyToOne extends Field {

}

class DateField extends Field {
    async write(record, value) {
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

    async read(record) {
        const value = await super.read(record);
        if (value === null || value === undefined) {
            return null;
        }
        return new Date(value);
    }
}

class BooleanField extends Field {
    async write(record, value) {
        return super.write(record, Boolean(value));
    }

    async read(record) {
        const value = await super.read(record);
        return Boolean(value);
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

    async write(record, value) {
        if (!this.values.includes(value)) {
            throw new Error(`Invalid value for enum field ${this.name}: ${value}`);
        }
        return super.write(record, value);
    }

    async read(record) {
        const value = await super.read(record);
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
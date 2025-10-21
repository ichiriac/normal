const { Field } = require('./Base');

/**
 * Text field type.
 * @extends Field
 */
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
    getMetadata() {
        const meta = super.getMetadata();
        delete meta.index;
        delete meta.unique;
        return meta;
    }
    buildColumn(table, metadata) {
        return super.buildColumn(table, metadata, () => {
            return table.text(this.column);
        });
    }
}

Field.behaviors.text = TextField;
module.exports = { TextField };
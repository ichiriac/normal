/**
 * Record class representing a data record in a model.
 */
class Record {
    constructor(model, data) {
        this._model = model;
        this._data = data;
        this._changes = {};
        this._isReady = false;
        this._isDirty = false;
    }

    sync(data) {
        Object.assign(this._data, data);
        this._isReady = true;
        this._isDirty = false;
        this._changes = {};
        return this;
    }

    toJSON() {
        const json = { model: this._model.name };
        for(let key in this._model.fields) {
            const field = this._model.fields[key];
            const value = field.serialize(this);
            if (value !== undefined) {
                json[key] = value;
            }
        }
        return json;
    }

    unlink() {
        this._model = null;
    }

    flush() {
        if (this._isDirty) {
            this._isDirty = false;
            // In a real implementation, this would persist changes to the database
        }
        return this;
    }

    write(data) {
        Object.assign(this._data, data);
        this._isDirty = true;
        return this.flush();
    }
}
module.exports = { Record };
/**
 * Record class representing a data record in a model.
 */
class Record {
    constructor(model, data) {
        this._model = model;
        this._changes = {};
        this._data = {};
        this.sync(data);
        this._isReady = Object.keys(data).length == Object.keys(model.fields).length;
    }

    sync(data) {
        for(let key in this._model.fields) {
            if (key === 'id' && this._data[key]) continue;
            const field = this._model.fields[key];
            this._data[key] = field.deserialize(this, data[key]);
            delete this._changes[key];
        }
        this._isReady = true;
        this._isDirty = Object.keys(this._changes).length > 0;
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

    ready() {
        if (this._isReady === true) return Promise.resolve(this); 
        if (this._isReady === false) return this._model.lookup(this.id).then(() => this);
        return this._isReady;
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
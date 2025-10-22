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

    /**
     * Flush pending changes to the database.
     * @returns 
     */
    async flush() {
        if (this._isDirty) {
            this._isDirty = false;
            const update = {};
            for (let key in this._changes) {
                update[key] = this._model.fields[key].serialize(this);
            }
            await this._model.query().where({ id: this.id }).update(update);
            this._isDirty = false;
            for(let key in this._changes) {
                this._data[key] = this._changes[key];
            }
            this._changes = {};
        }
        return this;
    }

    /**
     * Requests to write data to the record.
     * @param {*} data 
     * @returns 
     */
    async write(data) {
        if (data) {
            for(let key in data) {
                if (!this._model.fields.hasOwnProperty(key)) {
                    throw new Error(`Field ${key} does not exist on model ${this._model.name}`);
                }
                this[key] = data[key];
            }
        }
        if (this._isDirty) {
            return await this.flush();
        }
        return this;
    }
}
module.exports = { Record };
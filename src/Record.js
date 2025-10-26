/**
 * Record class representing a data record in a model.
 */
class Record {
    constructor(model, data, parent = null) {
        this._model = model;
        this._changes = {};
        this._parent = parent;
        this._data = {};
        this.sync(data);
        this._isReady = Object.keys(data).length > 1;
        this._flushed = false;
    }

    get _repo() {
        return this._model.repo;
    }

    sync(data) {
        if (this._parent) {
            this._parent.sync(data);
        }
        for (let field of Object.values(this._model.fields)) {
            let key = field.name;
            if (!data.hasOwnProperty(key) ) {
                if (data.hasOwnProperty(field.column)) {
                    key = field.column;
                } else {
                    continue;
                }
            }
            if (field.column === this._model.primaryField.column && this._data[field.column]) continue;
            this._data[field.column] = field.deserialize(this, data[key]);
            delete this._changes[field.column];
        }
        this._isReady = true;
        this._isDirty = Object.keys(this._changes).length > 0;
        return this;
    }

    /**
     * Convert the record to a JSON object (including parent data if applicable).
     */
    toJSON() {
        let json = {};
        if (this._parent) {
            json = this._parent.toJSON();
        }
        return { ...json, ...this.toRawJSON() };
    }

    /**
     * Serialize the record to a plain object.
     */
    toRawJSON() {
        const json = {};
        for (let key in this._model.fields) {
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
        this._model.events.emit('unlink', this);
        // @todo implement unlinking logic
        this._model = null;
    }

    /**
     * Flush pending changes to the database.
     * @returns 
     */
    async flush() {
        if (this._parent) {
            await this._parent.flush();
        }
        if (this._isDirty) {
            this._isDirty = false;
            const update = {};
            for (let key in this._changes) {
                update[key] = this._model.fields[key].serialize(this);
            }
            await this._model.query().where({ id: this.id }).update(update);
            this._isDirty = false;
            for (let key in this._changes) {
                this._data[key] = this._changes[key];
            }
            this._changes = {};
            this._flushed = true;
            // update cache
            if (this._model.cache && !this._model.repo.connection.transactional) {
                this._model.cache.set(this._model.name + ':' + this.id, this.toRawJSON(), this._model.cacheTTL);
            }
            this._model.events.emit('update', this);
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
            for (let key in data) {
                if (this._model.fields.hasOwnProperty(key)) {
                    this[key] = data[key];
                    delete data[key];
                }
            }
            if (this._parent && Object.keys(data).length > 0) {
                await this._parent.write(data);
            }
            const remainKeys = Object.keys(data);
            if (remainKeys.length > 0) {
                throw new Error(`Field ${remainKeys.join(', ')} does not exist on model ${this._model.name}`);
            }
        }
        return await this.flush();
    }
}

module.exports = { Record };
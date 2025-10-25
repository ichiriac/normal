/**
 * Record class representing a data record in a model.
 */
class Record {
    constructor(model, data) {
        this._model = model;
        this._changes = {};
        this._data = {};
        this.sync(data);
        this._isReady = Object.keys(data).length > 1;
        this._flushed = false;
    }

    get _repo() {
        return this._model.repo;
    }

    sync(data) {
        for(let key in this._model.fields) {
            if (!data.hasOwnProperty(key)) continue;
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
        const json = {};
        // Include parent fields first (if any), then child fields so child can override when names clash
        if (this._model.inherits) {
            const parentModel = this._model.repo.get(this._model.inherits);
            for (const field of Object.values(parentModel.fields)) {
                const value = field.serialize(this);
                if (value !== undefined) {
                    json[field.name] = value;
                }
            }
        }
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
            this._flushed = true;
            // update cache
            if (this._model.cache && !this._model.repo.connection.transactional) {
                this._model.cache.set(this._model.name + ':' + this.id, this.toJSON(), this._model.cacheTTL);
            }
        }
        //if (this._model.super && )
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
                    if (this._model.super) {
                        if (this._model.super.fields.hasOwnProperty(key)) {
                            this[key] = data[key];
                            continue;
                        }
                    }
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
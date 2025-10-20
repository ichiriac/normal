class Record {
    constructor(model, data) {
        this._model = model;
        this._data = data;
        this._changes = {};
        this._isReady = false;
        this._isDirty = false;
    }

    static create(data) {
        return new this(model, data);
    }

    sync(data) {
        Object.assign(this._data, data);
        this._isReady = true;
        this._isDirty = false;
        this._changes = {};
        return this;
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
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
      if (!data.hasOwnProperty(key)) {
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
   * Gets a model instance by name.
   * @param {string} name - The name of the model.
   * @returns {Model} The model instance.
   */
  getModel(name) {
    return this._model.repo.get(name);
  }

  /**
   * Gets the definition of a field by name.
   * @param {string} fieldName - The name of the field.
   * @returns {Field} The field definition.
   * @throws {Error} If the field does not exist.
   */
  getField(name) {
    if (this._model.fields.hasOwnProperty(name)) {
      return this._model.fields[name];
    } else {
      throw new Error(`Field ${name} does not exist on model ${this._model.name}`);
    }
  }

  /**
   * Check if the field value has changed in the record.
   * @param {string} field - The field name.
   * @returns {boolean}
   */
  isChanged(field) {
    // check if record is new : then all fields are considered changed
    const id = this._model.primaryField.read(this);;
    if (!id) return true;
    // check if field is in changes
    const f = this.getField(field);
    return this._changes.hasOwnProperty(f.column);
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
      const value = field.toJSON(this);
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

  /**
   * Pre-validate the record and its parent records.
   * @returns {Promise<Record>}
   */
  async pre_validate() {
    return this;
  }

  /**
   * Pre-create hook for the record.
   * @returns {Promise<Record>}
   */
  async pre_create() {
    return this;
  }

  /**
   * Pre-update hook for the record.
   * @returns {Promise<Record>}
   */
  async pre_update() {
    return this;
  }

  /**
   * Pre-unlink hook for the record.
   * @returns {Promise<Record>}
   */
  async pre_unlink() {
    return this;
  }

  /**
   * Post-create hook for the record.
   * @returns {Promise<Record>}
   */
  async post_create() {
    return this;
  }

  /**
   * Post-update hook for the record.
   * @returns {Promise<Record>}
   */
  async post_update() {
    return this;
  }

  /**
   * Post-unlink hook for the record.
   * @returns {Promise<Record>}
   */
  async post_unlink() {
    return this;
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

      // run pre-update hooks
      const pre_update = [];
      await this.pre_update();
      await this.pre_validate();
      for (let field of Object.values(this._model.fields)) {
        pre_update.push(field.pre_update(this));
      }
      await Promise.all(pre_update);

      // construct update object
      const update = {};
      for (let field of Object.values(this._model.fields)) {
        if (field.stored === false) continue;
        field.validate(this);
        if (this._changes.hasOwnProperty(field.column)) {
          update[field.column] = field.serialize(this);
        }
      }

      // perform update on database
      if (Object.keys(update).length > 0) {
        await this._model.query().where({ id: this.id }).update(update);
      }

      // flush changes to record
      this._isDirty = false;
      for (let key in this._changes) {
        this._data[key] = this._changes[key];
      }
      this._changes = {};
      this._flushed = true;

      // update cache
      if (this._model.cache) {
        this._model.cache.set(
          this._model.name + ':' + this.id,
          this.toRawJSON(),
          this._model.cacheTTL
        );
      }

      // run post hooks
      const post_update = [];
      for (let key in update) {
        post_update.push(this._model.fields[key].post_update(this));
      }
      await Promise.all(post_update);
      await this.post_update();
      this._model.events.emit('update', this);
      if (this._model.cacheInvalidation) {
        this._model.invalidateCache();
      }
    }
    return this;
  }

  /**
   * Unlink (delete) the record from the database.
   */
  async unlink() {
    // Capture current model and clear the instance reference immediately so callers
    // observing this record right after calling unlink() see it as detached.
    const model = this._model;
    if (!model) {
      return this;
    }
    this._model = null;
    await this.pre_unlink();
    await this.pre_validate();
    const pre_unlink = [];
    for (let field of Object.values(model.fields)) {
      pre_unlink.push(field.pre_unlink(this));
    }
    await Promise.all(pre_unlink);

    // delete from database
    await model.query().where({ id: this.id }).delete();
    if (this._parent) {
      await this._parent.unlink();
    }

    // run post hooks
    await this.post_unlink();
    const post_unlink = [];
    for (let field of Object.values(model.fields)) {
      post_unlink.push(field.post_unlink(this));
    }
    await Promise.all(post_unlink);
    model.events.emit('unlink', this);

    // flush cache invalidation
    if (model.cache) {
      model.cache.expire(model.name + ':' + this.id);
    }
    if (model.cacheInvalidation) {
      model.invalidateCache();
    }

    // remove reference from model entities
    model.entities.delete(this.id);

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
        throw new Error(
          `Field ${remainKeys.join(', ')} does not exist on model ${this._model.name}`
        );
      }
    }
    return await this.flush();
  }
}

module.exports = { Record };

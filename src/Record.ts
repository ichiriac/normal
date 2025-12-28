import type { Model } from './Model.js';

type AnyMap = { [key: string]: any };

type AnyField = {
  name: string;
  column: string;
  stored?: boolean;
  deserialize: (rec: Record, v: any) => any;
  serialize: (rec: Record) => any;
  toJSON: (rec: Record) => any;
  validate: (rec: Record) => void;
  pre_update: (rec: Record) => any;
  post_update: (rec: Record) => any;
  pre_unlink: (rec: Record) => any;
  post_unlink: (rec: Record) => any;
};

/**
 * Record class representing a data record in a model.
 */
class Record {
  public _model: Model | null;
  public _changes: AnyMap;
  public _parent: Record | null;
  public _data: AnyMap;
  public _isReady: boolean | Promise<any>;
  public _flushed: boolean;
  public _isDirty: boolean;

  constructor(model: Model, data: AnyMap, parent: Record | null = null) {
    this._model = model;
    this._changes = {};
    this._parent = parent;
    this._data = {};
    this.sync(data);
    this._isReady = Object.keys(data).length > 1;
    this._flushed = false;
    this._isDirty = false;
  }

  get _repo(): any {
    return (this._model as any).repo;
  }

  sync(data: AnyMap): this {
    if (this._parent) {
      this._parent.sync(data);
    }
    for (const field of Object.values((this._model as any).fields) as AnyField[]) {
      let key = field.name;
      if (!data.hasOwnProperty(key)) {
        if (data.hasOwnProperty(field.column)) {
          key = field.column;
        } else {
          continue;
        }
      }
      if (field.column === (this._model as any).primaryField.column && this._data[field.column])
        continue;
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
  getModel(name: string): any {
    return (this._model as any).repo.get(name);
  }

  /**
   * Gets the definition of a field by name.
   * @param {string} fieldName - The name of the field.
   * @returns {Field} The field definition.
   * @throws {Error} If the field does not exist.
   */
  getField(name: string): any {
    if ((this._model as any).fields.hasOwnProperty(name)) {
      return (this._model as any).fields[name];
    } else {
      throw new Error(`Field ${name} does not exist on model ${(this._model as any).name}`);
    }
  }

  /**
   * Check if the field value has changed in the record.
   * @param {string} field - The field name.
   * @returns {boolean}
   */
  isChanged(field: string): boolean {
    // check if record is new : then all fields are considered changed
    const id = (this._model as any).primaryField.read(this);
    if (!id) return true;
    // check if field is in changes
    const f = this.getField(field);
    return this._changes.hasOwnProperty(f.column);
  }

  /**
   * Convert the record to a JSON object (including parent data if applicable).
   */
  toJSON(): AnyMap {
    let json = {};
    if (this._parent) {
      json = this._parent.toJSON();
    }
    return { ...json, ...this.toRawJSON() };
  }

  /**
   * Serialize the record to a plain object.
   */
  toRawJSON(): AnyMap {
    const json: AnyMap = {};
    for (const key in (this._model as any).fields) {
      const field = (this._model as any).fields[key];
      const value = field.toJSON(this);
      if (value !== undefined) {
        json[key] = value;
      }
    }
    return json;
  }

  ready(): Promise<this> {
    if (this._isReady === true) return Promise.resolve(this);
    if (this._isReady === false)
      return (this._model as any).lookup((this as any).id).then(() => this);
    return this._isReady as Promise<this>;
  }

  /**
   * Pre-validate the record and its parent records.
   * @returns {Promise<Record>}
   */
  async pre_validate(): Promise<this> {
    return this;
  }

  /**
   * Pre-create hook for the record.
   * @returns {Promise<Record>}
   */
  async pre_create(): Promise<this> {
    return this;
  }

  /**
   * Pre-update hook for the record.
   * @returns {Promise<Record>}
   */
  async pre_update(): Promise<this> {
    return this;
  }

  /**
   * Pre-unlink hook for the record.
   * @returns {Promise<Record>}
   */
  async pre_unlink(): Promise<this> {
    return this;
  }

  /**
   * Post-create hook for the record.
   * @returns {Promise<Record>}
   */
  async post_create(): Promise<this> {
    return this;
  }

  /**
   * Post-update hook for the record.
   * @returns {Promise<Record>}
   */
  async post_update(): Promise<this> {
    return this;
  }

  /**
   * Post-unlink hook for the record.
   * @returns {Promise<Record>}
   */
  async post_unlink(): Promise<this> {
    return this;
  }

  /**
   * Flush pending changes to the database.
   * @returns
   */
  async flush(): Promise<this> {
    if (this._parent) {
      await this._parent.flush();
    }
    if (this._isDirty) {
      this._isDirty = false;

      // run pre-update hooks
      const pre_update = [];
      await this.pre_update();
      await this.pre_validate();
      for (const field of Object.values((this._model as any).fields) as AnyField[]) {
        pre_update.push(field.pre_update(this));
      }
      await Promise.all(pre_update);

      // construct update object
      const update: AnyMap = {};
      for (const field of Object.values((this._model as any).fields) as AnyField[]) {
        if (field.stored === false) continue;
        field.validate(this);
        if (this._changes.hasOwnProperty(field.column)) {
          update[field.column] = field.serialize(this);
        }
      }

      // perform update on database
      if (Object.keys(update).length > 0) {
        await (this._model as any)
          .query()
          .where({ id: (this as any).id })
          .update(update);
      }

      // flush changes to record
      this._isDirty = false;
      for (const key in this._changes) {
        this._data[key] = this._changes[key];
      }
      this._changes = {};
      this._flushed = true;

      // update cache
      if ((this._model as any).cache) {
        (this._model as any).cache.set(
          (this._model as any).name + ':' + (this as any).id,
          this.toRawJSON(),
          (this._model as any).cacheTTL
        );
      }

      // run post hooks
      const post_update = [];
      for (const key in update) {
        post_update.push((this._model as any).fields[key].post_update(this));
      }
      await Promise.all(post_update);
      await this.post_update();
      (this._model as any).events.emit('update', this);
      if ((this._model as any).cacheInvalidation) {
        (this._model as any).invalidateCache();
      }
    }
    return this;
  }

  /**
   * Unlink (delete) the record from the database.
   */
  async unlink(): Promise<this> {
    // Capture current model and clear the instance reference immediately so callers
    // observing this record right after calling unlink() see it as detached.
    const model = this._model as any;
    if (!model) {
      return this;
    }
    this._model = null;
    await this.pre_unlink();
    await this.pre_validate();
    const pre_unlink = [];
    for (const field of Object.values(model.fields) as AnyField[]) {
      pre_unlink.push(field.pre_unlink(this));
    }
    await Promise.all(pre_unlink);

    // delete from database
    await model
      .query()
      .where({ id: (this as any).id })
      .delete();
    if (this._parent) {
      await this._parent.unlink();
    }

    // run post hooks
    await this.post_unlink();
    const post_unlink = [];
    for (const field of Object.values(model.fields) as AnyField[]) {
      post_unlink.push(field.post_unlink(this));
    }
    await Promise.all(post_unlink);
    model.events.emit('unlink', this);

    // flush cache invalidation
    if (model.cache) {
      model.cache.expire(model.name + ':' + (this as any).id);
    }
    if (model.cacheInvalidation) {
      model.invalidateCache();
    }

    // remove reference from model entities
    model.entities.delete((this as any).id);

    return this;
  }

  /**
   * Requests to write data to the record.
   * @param {*} data
   * @returns
   */
  async write(data: AnyMap): Promise<this> {
    if (data) {
      for (const key in data) {
        if ((this._model as any).fields.hasOwnProperty(key)) {
          (this as any)[key] = data[key];
          delete data[key];
        }
      }
      if (this._parent && Object.keys(data).length > 0) {
        await this._parent.write(data);
      }
      const remainKeys = Object.keys(data);
      if (remainKeys.length > 0) {
        throw new Error(
          `Field ${remainKeys.join(', ')} does not exist on model ${(this._model as any).name}`
        );
      }
    }
    return await this.flush();
  }
}

export { Record };

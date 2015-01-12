/**
 * Defines the model class
 */
module.exports = function(session, name, config, entity) {
  this.session = session;
  this.name = name;
  this.table = config.table || name;
  this.properties = config.properties || {};
  this.relations = config.relations || {};
  this.entity = entity;
  this._requests = {};
  Object.freeze(this);
};

/**
 * Declare each class property
 */
Object.defineProperties(module.exports.prototype, {
  session: { writable: true },
  table: { writable: true },
  relations: { writable: true },
  properties: { writable: true },
  entity: { writable: true },
});

/**
 * Execute the specified request
 */
module.exports.prototype.query = function(sql, params) {
  if (!this._requests.hasOwnProperty(sql)) {
    this._requests[sql] = this.session.query(sql);
  }
  return this._requests[sql].execute(this, params);
};

/**
 * Retrieves a record from it's primary key
 */
module.exports.prototype.findByPk = function(id) {
  return this.query(
    'SELECT * FROM this WHERE id =  :id', {
      id: id
    }
  ).first();
};

/**
 * Creates a new active record
 */
module.exports.prototype.create = function(data, state) {
  return new this.entity(this, data, state);
};

// END DECLARE
Object.freeze(module.exports);
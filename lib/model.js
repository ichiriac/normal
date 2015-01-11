/**
 * Defines the model class
 */
module.exports = function(session, name, config) {
  this.session = session;
  this.name = name;
  this.table = config.table || name;
  this.properties = config.properties || {};
  this.relations = config.relations || {};
  Object.freeze(this);
};

/**
 * Declare each class property
 */
Object.defineProperties(module.exports, {
  session: { value: null, writable: true },
  table: { value: null, writable: true },
  relations: { value: null, writable: true },
  properties: { value: null, writable: true },
});

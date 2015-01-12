/**
 * Declares the entity class
 */
module.exports = function(model, data, state) {
  this.model = model;
  this.data = data;
  this.state = state === undefined ? module.exports.STATE_INSERT : state;
  Object.freeze(this);
};

/**
 * The active record is synchronized with the database
 */
module.exports.STATE_NONE = 0;
/**
 * The record is new and should be inserted
 */
module.exports.STATE_INSERT = 1;
/**
 * The record should be synchronized with the database
 */
module.exports.STATE_UPDATE = 2;
/**
 * Saves the current record
 */
module.exports.prototype.save = function() {
  return this;
};
/**
 * Deleting the current entity
 * @return entity
 */
module.exports.prototype.delete = function() {
  return this;
};


// END DECLARE
Object.freeze(module.exports);
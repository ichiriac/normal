/**
 * Main api
 */

module.exports.Model = require('./lib/model');
module.exports.Entity = require('./lib/record');
module.exports.Session = require('./lib/session');
module.exports.create = function(db, config) {
  return new this.Session(db, config, this.Model, this.Entity);
};

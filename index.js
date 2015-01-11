/**
 * Main api
 */

module.Model = require('./lib/model');
module.Entity = require('./lib/record');
module.Session = require('./lib/session');
module.create = function(db, config) {
  return new this.Session(db, config, this.Model, this.Entity);
};

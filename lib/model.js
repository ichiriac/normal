
var Model = function(name, config) {
  this.name = name;
  this.config = config;
  this.session = session;
  if (!this.config.hasOwnProperty('table')) {
    this.config.table = name;
  }
  if (!this.config.hasOwnProperty('relations')) {
    this.config.relations = {};
  }
};

module.exports = Model;
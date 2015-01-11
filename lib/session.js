/**
 * Defines the session manager class
 */
module.exports = function(db, config, baseModel, baseEntity) {
  this.db = db;
  this.config = config;
  this.baseModel = baseModel;
  this.baseEntity = baseEntity;
  Object.freeze(this);
};

/**
 * Declare each class property
 */
Object.defineProperties(module.exports,  {
  db: {
    value: null,
    writable: true
  },
  config: {
    value: {},
    writable: true
  },
  baseModel: {
    value: function() {},
    writable: true
  },
  baseEntity: {
    value: function() {},
    writable: true
  },
  definitions: {
    value: {},
    writable: true
  },
  instances: {
    value: {},
    writable: true
  }
});

/**
 * Gets a model instance
 */
module.exports.prototype.get = function(model) {
  if (!this.instances.hasOwnProperty(model)) {
    if (!this.config.hasOwnProperty(model)) {
      throw new Error('Undefined model "'+model+'"');
    }
    var ctor;
    if (!this.defintions.hasOwnProperty(model)) {
      ctor = this.baseModel;
    } else {
      ctor = this.definitions[model].model;
    }
    this.instances[model] = new ctor(this, name, this.config[name]);
  }
  return this.instances[model];
};
/**
 * Creates a new entity
 */
module.exports.prototype.create = function(model, data, state) {
};

/**
 * Declares a new model entity
 */
module.exports.prototype.model = function(name, body) {
  if (!this.defintions.hasOwnProperty(name)) {
    this.defintions[name] = { model: null, entity: null };
  }
  // declare constructor
  var ctor, parent = this.defintions[name].model || this.baseModel;
  if (body.hasOwnProperty('__construct') && typeof body.__construct === 'function') {
    ctor =  body.__construct;
    delete body.__construct;
  } else {
    ctor = function() {
      return parent.apply(this, arguments);
    };
  }
  // construct the prototype
  ctor.prototype = Object.create(
    parent.prototype, body || {}
  );
  ctor.prototype.parent = parent.prototype;
  ctor.prototype.constructor = ctor;
  this.defintions[name].model = ctor;
  return this;
};
/**
 * Declares a new model entity
 */
module.exports.prototype.entity = function(name, body) {

};
/**
 * Declares a new model entity
 */
module.exports.prototype.declare = function(name, model, entity) {
  return [
    model ? this.model(name, model) : null,
    entity ? this.entity(name, entity) : null
  ];
};

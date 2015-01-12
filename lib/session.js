"use strict";
/**
 * Defines the session manager class
 */
module.exports = function Session(db, config, baseModel, baseEntity) {
  this.db = db;
  this.config = config || {};
  this.baseModel = baseModel;
  this.baseEntity = baseEntity;
  this.definitions = {};
  this.instances = {};
  Object.freeze(this);
};

/**
 * Declare each class property
 */
Object.defineProperty(module.exports.prototype, 
  'db', { writable: true, enumerable: true }
);
Object.defineProperty(module.exports.prototype, 
  'config', { writable: true, enumerable: true }
);
Object.defineProperty(module.exports.prototype, 
  'baseModel', { writable: true }
);
Object.defineProperty(module.exports.prototype, 
  'baseEntity', { writable: true }
);
Object.defineProperty(module.exports.prototype, 
  'definitions', { writable: true }
);
Object.defineProperty(module.exports.prototype, 
  'instances', { writable: true }
);

/**
 * Gets a model instance
 */
module.exports.prototype.get = function(model) {
  if (!this.instances.hasOwnProperty(model)) {
    if (!this.config.hasOwnProperty(model)) {
      throw new Error('Undefined model "'+model+'"');
    }
    var ctor;
    var entity;
    if (!this.definitions.hasOwnProperty(model)) {
      ctor = this.baseModel;
      entity = this.baseEntity;
    } else {
      ctor = this.definitions[model].model || this.baseModel;
      entity = this.definitions[model].entity || this.baseEntity;
    }
    this.instances[model] = new ctor(
      this,
      model,
      this.config[model],
      entity
    );
    Object.freeze(this.instances[model]);
  }
  return this.instances[model];
};
/**
 * Creates a new entity
 */
module.exports.prototype.create = function(model, data, state) {
  return this.get(model).create(data, state);
};

/**
 * Declares a new model entity
 */
module.exports.prototype.model = function(name, body) {
  if (!this.definitions.hasOwnProperty(name)) {
    this.definitions[name] = { model: null, entity: null };
  }
  // declare constructor
  var parent = this.definitions[name].model || this.baseModel;
  var ctor = function() {
    this.parent.constructor.apply(this, arguments);
    if (body.hasOwnProperty('__construct') && typeof body.__construct === 'function') {
      body.__construct.apply(this, arguments);
    }
    Object.freeze(this.parent);
    return this;
  };

  // construct the prototype
  ctor.prototype = Object.create(
    parent.prototype, body || {}
  );
  ctor.prototype.parent = parent.prototype;
  ctor.prototype.constructor = ctor;
  this.definitions[name].model = ctor;
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

// END DECLARE
Object.freeze(module.exports);
'use strict';

const { extendModel } = require('../src/utils/extender');

describe('extendModel', () => {
  test('extends model.cls with object mixin; does not copy statics', () => {
    const SYMBOL = Symbol('inst');
    // Base model with a simple ActiveRecord class
    const model = Object.create({});
    model.cls = class AR { base() { return 'base'; } };

    const mixin = {
      method() { return this.base() + '!'; },
      get up() { return 'UP'; },
      [SYMBOL]: 42,
      // looks static-ish but object mixins should not attach to model
      staticLike: function() { return 'nope'; },
    };

    extendModel(model, mixin);

    const inst = new model.cls();
    expect(inst.method()).toBe('base!');
    expect(inst.up).toBe('UP');
    expect(inst[SYMBOL]).toBe(42);

    // No statics attached for object mixins
    expect(model.staticLike).toBeUndefined();
    expect(model.cls.staticLike).toBeUndefined();
  });

  test('class mixin: attaches static methods/getters/setters to model with super support', () => {
    const SYM = Symbol('sym');

    // Base model prototype with methods statics referenced by super
    const baseProto = {
      baseStatic() { return 'S'; },
      baseSym() { return 'SYM'; },
      get baseProp() { return 'B'; },
      set baseProp(v) { this._baseProp = String(v); },
    };
    const model = Object.create(baseProto);
    model.cls = class AR { base() { return 'x'; } };

    class Mixin {
      method() { return super.base() + '!'; }
      static staticMethod() { return super.baseStatic() + '!'; }
      static get prop() { return super.baseProp + '?'; }
      static set prop(v) { super.baseProp = '>' + v; }
      static [SYM]() { return super.baseSym() + '#'; }
    }

    extendModel(model, Mixin);

    // Instance extension
    const inst = new model.cls();
    expect(inst.method()).toBe('x!');

    // Static attachments on model
    expect(typeof model.staticMethod).toBe('function');
    expect(model.staticMethod()).toBe('S!');
    expect(model.prop).toBe('B?');
    model.prop = 'X';
    expect(model._baseProp).toBe('>X');
    expect(model[SYM]()).toBe('SYM#');

    // Not attached to model.cls
    expect(model.cls.staticMethod).toBeUndefined();

    // super resolves against prior model proto
    const newBase = Object.getPrototypeOf(model);
    expect(typeof newBase.baseStatic).toBe('function');
  });
});

'use strict';

const { extendWith } = require('../src/utils/extender');

describe('extendWith (class/object mixin extender)', () => {
  test('combines base instance methods with object mixin methods and getters', () => {
    class Base {
      greet() {
        return 'hi';
      }
      setName(n) {
        this.name = n;
      }
    }

    const secret = Symbol('secret');
    const mixin = {
      say(n) {
        this.setName(n);
        return `hello ${n}`;
      },
      get upperName() {
        return this.name ? String(this.name).toUpperCase() : undefined;
      },
      [secret]: 42,
    };

    const Extended = extendWith(Base, mixin);
    const x = new Extended();

    expect(x.greet()).toBe('hi'); // from Base
    expect(x.say('world')).toBe('hello world'); // from mixin
    expect(x.upperName).toBe('WORLD'); // getter preserved
    expect(x[secret]).toBe(42); // symbol copied

    // Prototypes are not altered
    expect(Object.prototype.hasOwnProperty.call(Base.prototype, 'say')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(mixin, 'greet')).toBe(false);

    // Static members from a class mixin are not copied
    class StaticMixin {
      static staticFoo() {
        return 'bar';
      }
    }
    const Extended2 = extendWith(Base, StaticMixin);
    expect(Extended2.staticFoo).toBeUndefined();
  });

  test('does not mutate BaseClass or mixin prototypes; still supports super', () => {
    class Base {
      base() {
        return 'base';
      }
    }
    class MixinClass {
      mix() {
        return 'mix';
      }
    }

    const baseProtoBefore = Object.getOwnPropertyNames(Base.prototype).slice().sort();
    const mixProtoBefore = Object.getOwnPropertyNames(MixinClass.prototype).slice().sort();

    const Extended = extendWith(Base, MixinClass);
    const inst = new Extended();
    expect(inst.base()).toBe('base');
    expect(inst.mix()).toBe('mix');

    // Base prototype unchanged
    expect(Object.getOwnPropertyNames(Base.prototype).slice().sort()).toEqual(baseProtoBefore);
    // Mixin prototype unchanged (no mutation)
    expect(Object.getOwnPropertyNames(MixinClass.prototype).slice().sort()).toEqual(mixProtoBefore);
    expect(Object.getPrototypeOf(MixinClass.prototype)).toBe(Object.prototype);
  });

  test('super inside mixin methods works without mutating mixin', () => {
    class Base {
      greet() {
        return 'hi';
      }
    }
    class MixinClass {
      greet() {
        return super.greet() + '!';
      }
    }
    const Extended = extendWith(Base, MixinClass);
    const inst = new Extended();
    expect(inst.greet()).toBe('hi!');
    // Base method remains reachable via prototype chaining
    expect(Base.prototype.greet.call(inst)).toBe('hi');
  });

  test('symbol-named methods and accessors support super without mutating mixin', () => {
    const SYM = Symbol('sym');
    const GET = Symbol('get');
    const SET = Symbol('set');

    class Base {
      greet() {
        return 'hi';
      }
      get label() {
        return 'L';
      }
      set label(v) {
        this._label = v;
      }
    }

    class MixinClass {
      [SYM]() {
        return super.greet() + '#';
      }
      get [GET]() {
        return (super.label || '') + 'X';
      }
      set [SET](v) {
        super.label = String(v).toUpperCase();
      }
    }

    const mixProtoBefore = Object.getOwnPropertyNames(MixinClass.prototype).slice().sort();
    const Extended = extendWith(Base, MixinClass);
    const inst = new Extended();

    expect(inst[SYM]()).toBe('hi#');
    inst[SET] = 'ok';
    expect(inst._label).toBe('OK');
    expect(inst[GET]).toBe('LX');

    // Ensure mixin prototype not mutated and its [[Prototype]] unchanged
    expect(Object.getOwnPropertyNames(MixinClass.prototype).slice().sort()).toEqual(mixProtoBefore);
    expect(Object.getPrototypeOf(MixinClass.prototype)).toBe(Object.prototype);

    // Also ensure object mixin with symbol method works
    const SYM2 = Symbol('sym2');
    const objMixin = {
      [SYM2]() {
        return super.greet() + '@';
      },
    };
    const Extended2 = extendWith(Base, objMixin);
    const inst2 = new Extended2();
    expect(inst2[SYM2]()).toBe('hi@');
  });
});

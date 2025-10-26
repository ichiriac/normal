'use strict';

// Module-level cache of rebuilt mixin functions per Base prototype.
// WeakMap lets GC collect entries when a Base class/prototype is unreachable.
/** @type {WeakMap<object, Map<Function, Function>>} */
const __BASE_REBUILD_CACHE = new WeakMap();
/**
 * Get (or create) the rebuild cache map for a given base prototype.
 * Reused across extendWith calls to avoid repeated eval for identical methods.
 * @param {object} baseProto
 * @returns {Map<Function, Function>}
 */
function getBaseCache(baseProto) {
  let m = __BASE_REBUILD_CACHE.get(baseProto);
  if (!m) {
    m = new Map();
    __BASE_REBUILD_CACHE.set(baseProto, m);
  }
  return m;
}

/**
 * Create a new class by extending a Base class with a mixin (class or plain object).
 * - Copies ONLY instance properties/methods from the mixin (no static members).
 * - Preserves property descriptors (getters/setters, enumerability, etc.).
 * - Symbol properties on the mixin are also copied.
 *
 * Example:
 * class Base { greet() { return 'hi'; } }
 * const mixin = {
 *   get upperName() { return this.name?.toUpperCase(); },
 *   say(name) { this.name = name; return `hello ${name}`; }
 * };
 * const Extended = extendWith(Base, mixin);
 * const x = new Extended();
 * x.say('world'); // 'hello world'
 * x.greet();      // 'hi'
 * x.upperName;    // 'WORLD'
 *
 * @template T
 * @param {new (...args:any[]) => T} BaseClass - The base class to extend
 * @param {object|Function} mixin - A class (uses its prototype) or a plain object providing instance members
 * @returns {new (...args:any[]) => T} - A new class extending BaseClass with mixin members
 */
function extendWith(BaseClass, mixin) {
  if (typeof BaseClass !== 'function') {
    throw new TypeError('extendWith: BaseClass must be a constructor function/class');
  }

  const mixinSource =
    mixin && typeof mixin === 'function'
      ? mixin.prototype
      : mixin && typeof mixin === 'object'
        ? mixin
        : null;

  // Fast path: nothing to mix in
  if (!mixinSource) {
    return class extends BaseClass {};
  }

  // Collect descriptors (strings + symbols), excluding constructor
  const stringDescs = Object.getOwnPropertyDescriptors(mixinSource);
  delete stringDescs.constructor;
  const symbolKeys = Object.getOwnPropertySymbols(mixinSource);

  // Create concrete subclass that preserves BaseClass constructor semantics
  class Combined extends BaseClass {
    constructor(...args) {
      super(...args);
    }
  }

  // Helper: rebuild a method/getter/setter with proper [[HomeObject]] so `super` works
  // Cache rebuilt functions per Base prototype to avoid repeated eval for identical mixin fns
  const buildMethodWithSuper = (key, fn, kind) => {
    // check the cache first
    const cache = getBaseCache(BaseClass.prototype);
    const cached = cache.get(fn);
    if (cached) return cached;

    const src = Function.prototype.toString.call(fn).trim();
    // Only attempt rebuild when `super` is present; otherwise return original
    if (!/\bsuper\b/.test(src)) return fn;
    // Construct an object literal with the method text
    let code;
    if (kind === 'get' || kind === 'set') {
      // src should look like: 'get name() { ... }' or 'set name(v) { ... }'
      code = `({ ${src} })`;
    } else {
      // Method: src like 'name(args) { ... }'
      // Ensure the property name matches the provided key
      // If src already starts with the same name, use as-is; else rebuild using key
      const m = src.match(/^([a-zA-Z_$][\w$]*)\s*\(/);
      if (m && m[1] === String(key)) {
        code = `({ ${src} })`;
      } else {
        // Replace the leading name with our key
        const body = src.replace(/^[^(]+\(/, `${String(key)}(`);
        code = `({ ${body} })`;
      }
    }
    // Create the home object and set its prototype to BaseClass.prototype
    const tmp = eval(code); // eslint-disable-line no-eval
    Object.setPrototypeOf(tmp, BaseClass.prototype);
    const d = Object.getOwnPropertyDescriptor(tmp, key);
    const out = kind === 'get' ? d.get : kind === 'set' ? d.set : d.value;
    cache.set(fn, out);
    return out;
  };

  // Helper: rebuild a computed (symbol or dynamic) key method/getter/setter with proper [[HomeObject]]
  const buildComputedWithSuper = (key, fn, kind) => {
    const cache = getBaseCache(BaseClass.prototype);
    const cached = cache.get(fn);
    if (cached) return cached;

    const src = Function.prototype.toString.call(fn).trim();
    if (!/\bsuper\b/.test(src)) return fn;

    // Extract params and body to rebuild as a computed-name method
    const extractSig = (s) => {
      const open = s.indexOf('(');
      if (open < 0) return null;
      let depth = 0,
        i = open;
      for (; i < s.length; i++) {
        const ch = s[i];
        if (ch === '(') depth++;
        else if (ch === ')') {
          depth--;
          if (!depth) break;
        }
      }
      const close = i;
      const params = s.slice(open + 1, close);
      let j = s.indexOf('{', close);
      if (j < 0) return null;
      depth = 0;
      let k = j;
      for (; k < s.length; k++) {
        const ch = s[k];
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (!depth) break;
        }
      }
      const body = s.slice(j + 1, k);
      const head = s.slice(0, open).trim();
      const isAsync = /\basync\b/.test(head);
      const isGenerator = head.includes('*');
      return { params, body, isAsync, isGenerator };
    };

    const sig = extractSig(src);
    // Fallback: if parsing failed, return original function
    if (!sig) return fn;

    const { params, body, isAsync, isGenerator } = sig;
    const asyncPrefix = isAsync ? 'async ' : '';
    const star = isGenerator ? '*' : '';

    // Build object literal text with computed key [K]
    let literal;
    if (kind === 'get') literal = `({ get [K]() {${body}} })`;
    else if (kind === 'set') literal = `({ set [K](${params}) {${body}} })`;
    else literal = `({ ${asyncPrefix}${star} [K](${params}) {${body}} })`;

    // Use Function constructor to avoid capturing outer scope; pass K and BaseProto explicitly
    const factory = new Function(
      'K',
      'BaseProto',
      `
      const obj = ${literal};
      Object.setPrototypeOf(obj, BaseProto);
      return Object.getOwnPropertyDescriptor(obj, K);
    `
    );

    const d = factory(key, BaseClass.prototype);
    const out = kind === 'get' ? d.get : kind === 'set' ? d.set : d.value;
    cache.set(fn, out);
    return out;
  };

  // Copy instance members to the new class prototype
  // Batch define string-keyed properties to reduce per-call overhead
  const batched = {};
  let hasBatched = false;
  for (const key of Object.keys(stringDescs)) {
    const desc = stringDescs[key];
    let outDesc = desc;
    // Replace functions only if super is present; otherwise reuse original descriptor
    if (typeof desc.value === 'function') {
      const nv = buildMethodWithSuper(key, desc.value, 'method');
      // Fast path: default data descriptor -> can assign directly (keeps enumerable: true)
      if (
        desc.writable === true &&
        desc.configurable === true &&
        desc.enumerable === true &&
        !('get' in desc || 'set' in desc)
      ) {
        Combined.prototype[key] = nv;
        continue;
      }
      if (nv !== desc.value) {
        outDesc = outDesc === desc ? { ...desc } : outDesc;
        outDesc.value = nv;
      }
    }
    if (typeof desc.get === 'function') {
      const ng = buildMethodWithSuper(key, desc.get, 'get');
      if (ng !== desc.get) {
        outDesc = outDesc === desc ? { ...desc } : outDesc;
        outDesc.get = ng;
      }
    }
    if (typeof desc.set === 'function') {
      const ns = buildMethodWithSuper(key, desc.set, 'set');
      if (ns !== desc.set) {
        outDesc = outDesc === desc ? { ...desc } : outDesc;
        outDesc.set = ns;
      }
    }
    batched[key] = outDesc;
    hasBatched = true;
  }
  if (hasBatched) Object.defineProperties(Combined.prototype, batched);
  // Aggregate symbol-keyed property definitions as well
  const symBatched = {};
  let hasSymBatched = false;
  for (const sym of symbolKeys) {
    const desc = Object.getOwnPropertyDescriptor(mixinSource, sym);
    if (!desc) continue;
    // Fast path for default data method descriptor
    if (
      typeof desc.value === 'function' &&
      desc.writable === true &&
      desc.configurable === true &&
      desc.enumerable === true &&
      !('get' in desc || 'set' in desc)
    ) {
      const nv = buildComputedWithSuper(sym, desc.value, 'method');
      Combined.prototype[sym] = nv;
      continue;
    }
    const out = { ...desc };
    if (typeof desc.value === 'function') {
      out.value = buildComputedWithSuper(sym, desc.value, 'method');
    }
    if (typeof desc.get === 'function') {
      out.get = buildComputedWithSuper(sym, desc.get, 'get');
    }
    if (typeof desc.set === 'function') {
      out.set = buildComputedWithSuper(sym, desc.set, 'set');
    }
    symBatched[sym] = out;
    hasSymBatched = true;
  }
  if (hasSymBatched) Object.defineProperties(Combined.prototype, symBatched);

  // Optionally set a readable class name (non-critical; ignore if fails)
  try {
    const mixName = typeof mixin === 'function' && mixin.name ? mixin.name : 'Mixin';
    Object.defineProperty(Combined, 'name', { value: `${BaseClass.name || 'Base'}With${mixName}` });
  } catch {
    /* non-fatal */
  }

  return Combined;
}

/**
 * Extend a Model object by:
 * 1) Extending its `model.cls` active-record class with instance members from the mixin (class or object)
 * 2) If mixin is a class, copying its static methods onto the model object itself as property methods
 *    with proper `super` support (so a static method using `super` resolves to the previous model proto).
 *
 * Note: We do NOT copy static properties other than callable/getter/setter members.
 * @param {object} model - A model object with a `cls` constructor and an existing prototype chain
 * @param {object|Function} mixin - Class or object to mix in
 * @returns {Function} The updated model.cls constructor (also mutates model)
 */
function extendModel(model, mixin) {
  if (!model || typeof model !== 'object' || typeof model.cls !== 'function') {
    throw new TypeError('extendModel: model must be an object with a cls constructor');
  }

  // 1) Extend the active record class used by the model, but only if mixin adds instance members
  let shouldExtendCls = true;
  if (mixin && (typeof mixin === 'function' || typeof mixin === 'object')) {
    const mixinSource = typeof mixin === 'function' ? mixin.prototype : mixin;
    if (mixinSource && typeof mixinSource === 'object') {
      const ownNames = Object.getOwnPropertyNames(mixinSource).filter((k) => k !== 'constructor');
      const ownSyms = Object.getOwnPropertySymbols(mixinSource);
      if (ownNames.length === 0 && ownSyms.length === 0) {
        shouldExtendCls = false; // nothing to add at instance level
      }
    }
  }
  if (shouldExtendCls) {
    model.cls = extendWith(model.cls, mixin);
  }

  // 2) If mixin is a class, attach its static methods to the model object with super support
  if (typeof mixin === 'function') {
    const stat = Object.getOwnPropertyDescriptors(mixin);
    delete stat.length;
    delete stat.name;
    delete stat.prototype;

    // Base proto for super resolution is the current prototype of the model object
    const baseProto = Object.getPrototypeOf(model);
    const nextProto = Object.create(baseProto);
    for (const key of Object.keys(nextProto)) {
      if (key === 'length' || key === 'name' || key === 'prototype') continue;
      delete nextProto[key];
    }

    // Generic builders bound to an arbitrary base prototype
    const buildNamed = (key, fn, kind) => {
      // Cache per-base prototype
      const cache = getBaseCache(baseProto);
      const cached = cache.get(fn);
      if (cached) return cached;

      // Check for super usage
      const src = Function.prototype.toString.call(fn).trim();
      if (!/\bsuper\b/.test(src)) return fn;

      let code;
      if (kind === 'get' || kind === 'set') {
        code = `({ ${src} })`;
      } else {
        const m = src.match(/^([a-zA-Z_$][\w$]*)\s*\(/);
        if (m && m[1] === String(key)) code = `({ ${src} })`;
        else {
          const body = src.replace(/^[^(]+\(/, `${String(key)}(`);
          code = `({ ${body} })`;
        }
      }
      const tmp = eval(code); // eslint-disable-line no-eval
      Object.setPrototypeOf(tmp, baseProto);
      const d = Object.getOwnPropertyDescriptor(tmp, key);
      const out = kind === 'get' ? d.get : kind === 'set' ? d.set : d.value;
      cache.set(fn, out);
      return out;
    };

    const buildComputed = (key, fn, kind) => {
      const cache = getBaseCache(baseProto);
      const cached = cache.get(fn);
      if (cached) return cached;

      // Check for super usage
      const src = Function.prototype.toString.call(fn).trim();
      if (!/\bsuper\b/.test(src)) return fn;

      const extractSig = (s) => {
        const open = s.indexOf('(');
        if (open < 0) return null;
        let depth = 0,
          i = open;
        for (; i < s.length; i++) {
          const ch = s[i];
          if (ch === '(') depth++;
          else if (ch === ')') {
            depth--;
            if (!depth) break;
          }
        }
        const close = i;
        const params = s.slice(open + 1, close);
        let j = s.indexOf('{', close);
        if (j < 0) return null;
        depth = 0;
        let k = j;
        for (; k < s.length; k++) {
          const ch = s[k];
          if (ch === '{') depth++;
          else if (ch === '}') {
            depth--;
            if (!depth) break;
          }
        }
        const body = s.slice(j + 1, k);
        const head = s.slice(0, open).trim();
        const isAsync = /\basync\b/.test(head);
        const isGenerator = head.includes('*');
        return { params, body, isAsync, isGenerator };
      };
      const sig = extractSig(src);
      if (!sig) return fn;
      const { params, body, isAsync, isGenerator } = sig;
      const asyncPrefix = isAsync ? 'async ' : '';
      const star = isGenerator ? '*' : '';
      let literal;
      if (kind === 'get') literal = `({ get [K]() {${body}} })`;
      else if (kind === 'set') literal = `({ set [K](${params}) {${body}} })`;
      else literal = `({ ${asyncPrefix}${star} [K](${params}) {${body}} })`;
      const factory = new Function(
        'K',
        'BaseProto',
        `
              const obj = ${literal};
              Object.setPrototypeOf(obj, BaseProto);
              return Object.getOwnPropertyDescriptor(obj, K);
            `
      );
      const d = factory(key, baseProto);
      const out = kind === 'get' ? d.get : kind === 'set' ? d.set : d.value;
      const c = getBaseCache(baseProto);
      c.set(fn, out);
      return out;
    };

    // Batch string keys
    const stringProps = {};
    let hasString = false;
    for (const key of Object.keys(stat)) {
      const desc = stat[key];
      if (key === 'length' || key === 'name' || key === 'prototype') continue;
      // Skip dangerous/known-conflicting keys like 'cache'
      if (key === 'cache') continue;
      // Avoid redefining any property already defined directly on the model
      if (Object.prototype.hasOwnProperty.call(model, key)) continue;
      // Only copy callable or accessor statics; skip plain data properties (numbers/booleans/strings/objects)
      if (
        typeof desc.value !== 'function' &&
        typeof desc.get !== 'function' &&
        typeof desc.set !== 'function'
      ) {
        continue;
      }
      let out = desc;
      if (typeof desc.value === 'function') {
        const nv = buildNamed(key, desc.value, 'method');
        // Fast path for default data descriptor on plain objects
        if (
          desc.writable === true &&
          desc.configurable === true &&
          desc.enumerable === true &&
          !('get' in desc || 'set' in desc)
        ) {
          nextProto[key] = nv;
          continue;
        }
        if (nv !== desc.value) {
          out = out === desc ? { ...desc } : out;
          out.value = nv;
        }
      }
      if (typeof desc.get === 'function') {
        const ng = buildNamed(key, desc.get, 'get');
        if (ng !== desc.get) {
          out = out === desc ? { ...desc } : out;
          out.get = ng;
        }
      }
      if (typeof desc.set === 'function') {
        const ns = buildNamed(key, desc.set, 'set');
        if (ns !== desc.set) {
          out = out === desc ? { ...desc } : out;
          out.set = ns;
        }
      }
      stringProps[key] = out;
      hasString = true;
    }
    if (hasString) Object.defineProperties(nextProto, stringProps);

    // Batch symbol keys
    const symProps = {};
    let hasSym = false;
    for (const sym of Object.getOwnPropertySymbols(mixin)) {
      const desc = Object.getOwnPropertyDescriptor(mixin, sym);
      if (!desc) continue;
      // Avoid redefining any symbol already present directly on the model
      if (Object.getOwnPropertySymbols(model).includes(sym)) continue;
      if (typeof desc.value === 'function') {
        const nv = buildComputed(sym, desc.value, 'method');
        if (
          desc.writable === true &&
          desc.configurable === true &&
          desc.enumerable === true &&
          !('get' in desc || 'set' in desc)
        ) {
          nextProto[sym] = nv;
          continue;
        }
        const out = { ...desc, value: nv };
        symProps[sym] = out;
        hasSym = true;
      } else {
        // Only process accessors; skip plain data symbols
        if (typeof desc.get !== 'function' && typeof desc.set !== 'function') continue;
        const out = { ...desc };
        if (typeof desc.get === 'function') out.get = buildComputed(sym, desc.get, 'get');
        if (typeof desc.set === 'function') out.set = buildComputed(sym, desc.set, 'set');
        symProps[sym] = out;
        hasSym = true;
      }
    }
    if (hasSym) Object.defineProperties(nextProto, symProps);

    // Use getOwnPropertyNames to account for non-enumerable statics (class methods are non-enumerable)
    if (
      Object.getOwnPropertyNames(nextProto).length > 0 ||
      Object.getOwnPropertySymbols(nextProto).length > 0
    ) {
      Object.setPrototypeOf(model, nextProto);
    }
  }

  return model;
}

module.exports = { extendWith, extendModel };

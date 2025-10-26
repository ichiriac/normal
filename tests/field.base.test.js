'use strict';

const { Field } = require('../src/Fields');
const { IntegerField } = require('../src/fields/Integer');

describe('Field Base behaviors', () => {
  function makeModel(name = 'X') {
    return { name, repo: { cnx: null } };
  }

  test('Field.define: string shorthand and unknown type', () => {
    const model = makeModel('Foo');
    // string shorthand
    const f = Field.define(model, 'age', 'integer');
    expect(f).toBeInstanceOf(IntegerField);
    expect(f.name).toBe('age');

    // passing an instance
    const f2 = Field.define(model, 'age', f);
    expect(f2).toBeInstanceOf(IntegerField);

    // unknown type
    expect(() => Field.define(model, 'x', { type: 'nope' })).toThrow(/Unknown field type/);
  });

  test('Field.write/read change tracking and serialize', () => {
    const model = makeModel('Foo');
    const f = new IntegerField(model, 'age', { type: 'integer' });
    const rec = { _data: { age: 5 }, _changes: {}, _isDirty: false };

    // writing same value clears changes and keeps not dirty
    f.write(rec, 5);
    expect(rec._changes.hasOwnProperty('age')).toBe(false);
    expect(rec._isDirty).toBe(false);

    // writing new value sets changes and marks dirty
    f.write(rec, 6);
    expect(rec._changes.age).toBe(6);
    expect(rec._isDirty).toBe(true);
    // read prefers changes over data
    expect(f.read(rec)).toBe(6);
    expect(f.serialize(rec)).toBe(6);
  });

  test('Field.isDefChanged detects diffs', () => {
    const model = makeModel('Foo');
    const f = new IntegerField(model, 'age', { type: 'integer', required: false, unique: false });
    const meta = f.getMetadata();
    expect(f.isDefChanged(meta)).toBe(false);

    const meta2 = { ...meta, required: true };
    expect(f.isDefChanged(meta2)).toBe(true);

    const meta3 = { ...meta, unique: true };
    expect(f.isDefChanged(meta3)).toBe(true);
  });
});

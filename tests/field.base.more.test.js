'use strict';

const { Field } = require('../src/Fields');
const { IntegerField } = require('../src/fields/Integer');
const { StringField } = require('../src/fields/String');

describe('Field Base - additional coverage', () => {
  const makeModel = (name = 'M') => ({
    name,
    repo: { cnx: null },
    fields: {},
    cls_init: true,
    cls: function () {},
  });

  test('validate required field throws', () => {
    const model = makeModel('Foo');
    const f = new IntegerField(model, 'age', { type: 'integer', required: true });
    const rec = { _data: {}, _changes: {} };
    expect(() => f.validate(rec)).toThrow(/required/);
  });

  test('default values: constant and function', () => {
    const model = makeModel('Foo');
    const f1 = new IntegerField(model, 'a', { type: 'integer', default: 7 });
    const rec1 = { _data: {}, _changes: {} };
    expect(f1.read(rec1)).toBe(7);

    const f2 = new IntegerField(model, 'b', { type: 'integer', default: () => 9 });
    const rec2 = { _data: {}, _changes: {} };
    expect(f2.read(rec2)).toBe(9);

    // getMetadata should include constant default but not function default
    const m1 = f1.getMetadata();
    expect(m1.default).toBe(7);
    const m2 = f2.getMetadata();
    expect(m2.default).toBeUndefined();
  });

  test('onChange sets triggers and emits when write actually changes', () => {
    const model = makeModel('Foo');
    const f = new IntegerField(model, 'age', { type: 'integer' });
    const rec = { _data: { age: 1 }, _changes: {}, _isDirty: false };
    let emitted = 0;
    f.onChange(() => emitted++);

    // same value -> no change, no emit
    f.write(rec, 1);
    expect(rec._isDirty).toBe(false);
    expect(emitted).toBe(0);

    // new value -> change, emit
    f.write(rec, 2);
    expect(rec._isDirty).toBe(true);
    expect(emitted).toBe(1);
  });

  test('recompute: sync and async, stored vs non-stored', async () => {
    const model = makeModel('Foo');
    // stored computed
    const fStored = new IntegerField(model, 'c', {
      type: 'integer',
      compute: function () {
        return 5;
      },
      stored: true,
    });
    const recS = { _data: {}, _changes: {} };
    expect(fStored.read(recS)).toBe(5);
    expect(recS._changes.c).toBe(5);

    // non-stored computed
    const fNon = new IntegerField(model, 'd', {
      type: 'integer',
      compute: function () {
        return 3;
      },
      stored: false,
    });
    const recN = { _data: {}, _changes: {} };
    expect(fNon.read(recN)).toBe(3);
    expect(recN._data.d).toBe(3);

    // async compute
    const fAsync = new IntegerField(model, 'e', {
      type: 'integer',
      compute: async function () {
        return 11;
      },
      stored: true,
    });
    const recA = { _data: {}, _changes: {} };
    const val = await fAsync.read(recA);
    expect(val).toBe(11);
    expect(recA._changes.e).toBe(11);
  });

  test('compute string method must exist', () => {
    const model = makeModel('Foo');
    // model.cls.prototype is used when compute is a string
    function Rec() {}
    Rec.prototype = {};
    model.cls = Rec;
    expect(
      () => new IntegerField(model, 'x', { type: 'integer', compute: 'doesNotExist' })
    ).toThrow(/Compute method 'doesNotExist'/);

    // Provide method and ensure no throw
    Rec.prototype.calc = function () {
      return 1;
    };
    expect(() => new IntegerField(model, 'y', { type: 'integer', compute: 'calc' })).not.toThrow();
  });

  test('depends validation errors on non-string and missing field', () => {
    const model = makeModel('Foo');
    // Attach a simple field to the model to allow post_attach traversal
    const f1 = new IntegerField(model, 'age', { type: 'integer' });
    f1.attach(model, function () {});

    const bad1 = new IntegerField(model, 'a', { type: 'integer', depends: [42] });
    expect(() => bad1.post_attach()).toThrow(/Depends entries must be strings/);

    const bad2 = new IntegerField(model, 'b', { type: 'integer', depends: ['missingField'] });
    expect(() => bad2.post_attach()).toThrow(/is not found in model/);
  });

  test('buildColumn: rename when metadata column differs', () => {
    const model = makeModel('Foo');
    const f = new StringField(model, 's', { type: 'string' });
    const metadata = { column: 'old_s' };
    const calls = [];
    const table = { renameColumn: (from, to) => calls.push(['rename', from, to]) };
    const changed = f.buildColumn(table, metadata);
    expect(changed).toBe(true);
    expect(calls).toEqual([['rename', 'old_s', 's']]);
  });

  test('buildIndex: add and drop index based on metadata', () => {
    const model = makeModel('Foo');
    const f = new StringField(model, 's', { type: 'string', index: true });
    const calls = [];
    const table = {
      index: (c) => calls.push(['index', c]),
      dropIndex: (c) => calls.push(['drop', c]),
    };

    // No previous metadata => add index
    expect(f.buildIndex(table, null)).toBe(true);
    expect(calls[0]).toEqual(['index', 's']);

    // Previously indexed but now definition.index is false => drop
    const f2 = new StringField(model, 't', { type: 'string', index: false });
    expect(f2.buildIndex(table, { column: 't', index: true })).toBe(true);
    expect(calls[1]).toEqual(['drop', 't']);
  });

  test('buildPostIndex triggers replaceColumn when metadata changed', async () => {
    const model = makeModel('Foo');
    const f = new StringField(model, 's', { type: 'string', required: false });
    // Simulate metadata requires change
    jest.spyOn(f, 'isDefChanged').mockReturnValue(true);
    const spy = jest.spyOn(f, 'replaceColumn').mockResolvedValue(true);
    const changed = await f.buildPostIndex({ column: 's', required: true });
    expect(changed).toBe(true);
    expect(spy).toHaveBeenCalled();
  });
});

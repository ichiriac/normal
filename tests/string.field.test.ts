// @ts-nocheck - Test file with implicit any types


import { StringField  } from '../src/fields/String';

describe('StringField validators and behavior', () => {
  const makeModel = (name = 'M') => ({ name, repo: { cnx: null } });

  test('write/read coercion to string', () => {
    const model = makeModel('Foo');
    const f = new StringField(model, 's', { type: 'string' });
    const rec = { _data: {}, _changes: {}, _isDirty: false };
    f.write(rec, 123);
    expect(rec._changes.s).toBe('123');
    expect(f.read(rec)).toBe('123');
  });

  test('validate: isEmail true and false', () => {
    const model = makeModel('Foo');
    const f = new StringField(model, 'email', { type: 'string', validate: { isEmail: true } });
    const rec = { _data: { email: 'alice@example.com' }, _changes: {} };
    expect(() => f.validate(rec)).not.toThrow();
    rec._data.email = 'not-an-email';
    expect(() => f.validate(rec)).toThrow(/Validation failed/);
  });

  test('validate: regex (is and not)', () => {
    const model = makeModel('Foo');
    const f = new StringField(model, 'code', { type: 'string', validate: { is: /^A\d{2}$/ } });
    const rec = { _data: { code: 'A12' }, _changes: {} };
    expect(() => f.validate(rec)).not.toThrow();

    const f2 = new StringField(model, 'bad', { type: 'string', validate: { not: /forbidden/ } });
    const rec2 = { _data: { bad: 'ok' }, _changes: {} };
    expect(() => f2.validate(rec2)).not.toThrow();
    rec2._data.bad = 'this contains forbidden value';
    expect(() => f2.validate(rec2)).toThrow(/Validation failed/);
  });

  test('validate: IP validators', () => {
    const model = makeModel('Foo');
    const f4 = new StringField(model, 'ip4', { type: 'string', validate: { isIP4: true } });
    const r4 = { _data: { ip4: '192.168.0.1' }, _changes: {} };
    expect(() => f4.validate(r4)).not.toThrow();
    r4._data.ip4 = '999.1.1.1';
    expect(() => f4.validate(r4)).toThrow(/Validation failed/);
  });

  test('metadata and column definition', () => {
    const model = makeModel('Foo');
    const f = new StringField(model, 's', {
      type: 'string',
      size: 64,
      validate: { isEmail: true },
    });
    const meta = f.getMetadata();
    expect(meta.size).toBe(64);
    expect(meta.validate).toEqual({ isEmail: true });
    const calls = [];
    const table = { string: (col, size) => calls.push([col, size]) };
    f.getColumnDefinition(table);
    expect(calls).toEqual([['s', 64]]);
  });
});

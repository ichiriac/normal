'use strict';

const { Connection, Repository } = require('..');

describe('Field behaviors: Date, Float, Integer, Reference', () => {
    let conn;
    let repo;

    beforeAll(async () => {
        conn = new Connection({ client: 'sqlite3', connection: { filename: ':memory:' } });
        await conn.connect();
        repo = new Repository(conn);

        class Sample {
            static name = 'Sample';
            static fields = {
                id: 'primary',
                d: { type: 'date', required: false, defaultToNow: false },
                // Note: SQLite's float column builder in knex doesn't support precision(scale) API
                // Avoid specifying precision/scale to keep schema build compatible across dialects.
                f: { type: 'float', unsigned: true },
                i: { type: 'integer', unsigned: true },
                ref: { type: 'reference', models: ['Foo', 'Bar'] },
            };
        }

        repo.register(Sample);
        await repo.sync({ force: true });
    });

    afterAll(async () => {
        await conn.destroy();
    });

    test('Date field read/write/serialize and validation', () => {
        const Sample = repo.get('Sample');
        const rec = Sample.allocate({});
        const dateField = Sample.fields.d;

        // write with Date instance
        const now = new Date('2020-01-02T03:04:05.000Z');
        rec.d = now;
        expect(rec.d instanceof Date).toBe(true);
        expect(dateField.serialize(rec)).toBe(now.toISOString());

        // write with ISO string
        rec.d = '2021-05-06T07:08:09.000Z';
        expect(rec.d instanceof Date).toBe(true);
        expect(dateField.serialize(rec)).toBe('2021-05-06T07:08:09.000Z');

        // write with timestamp number
        const ts = Date.UTC(2022, 0, 1);
        rec.d = ts;
        expect(rec.d instanceof Date).toBe(true);
        expect(dateField.serialize(rec)).toBe(new Date(ts).toISOString());

        // null and invalid value
        rec.d = null;
        expect(rec.d).toBeNull();
        expect(dateField.serialize(rec)).toBe(null);

        expect(() => { rec.d = 'not a date'; }).toThrow(/Invalid date value/);
    });

    test('Float field read/write/serialize and validation', () => {
        const Sample = repo.get('Sample');
        const rec = Sample.allocate({});
        const floatField = Sample.fields.f;

        // default read is null
        expect(rec.f).toBeNull();

        rec.f = 3.14;
        expect(rec.f).toBeCloseTo(3.14);
        expect(floatField.serialize(rec)).toBeCloseTo(3.14);

        rec.f = '2.50';
        expect(rec.f).toBeCloseTo(2.5);
        expect(floatField.serialize(rec)).toBeCloseTo(2.5);

        expect(floatField.getMetadata().unsigned).toBe(true);
        expect(floatField.getMetadata().precision).toBeUndefined();
        expect(floatField.getMetadata().scale).toBeUndefined();

        expect(() => { rec.f = null; }).toThrow(/Invalid float value/);
        expect(() => { rec.f = 'abc'; }).toThrow(/Invalid float value/);
    });

    test('Integer field read/write/serialize and validation', () => {
        const Sample = repo.get('Sample');
        const rec = Sample.allocate({});
        const intField = Sample.fields.i;

        // default is null
        expect(rec.i).toBeNull();

        rec.i = 42;
        expect(rec.i).toBe(42);
        expect(intField.serialize(rec)).toBe(42);

        rec.i = '7';
        expect(rec.i).toBe(7);
        expect(intField.serialize(rec)).toBe(7);

        // parseInt behavior
        rec.i = '9.9';
        expect(rec.i).toBe(9);
        expect(intField.serialize(rec)).toBe(9);

        expect(intField.getMetadata().unsigned).toBe(true);
        expect(() => { rec.i = null; }).toThrow(/Invalid integer value/);
        expect(() => { rec.i = 'xyz'; }).toThrow(/Invalid integer value/);
    });

    test('Reference field metadata and post-index build adds column', async () => {
        // Use a separate repo with dry-run to capture SQL and ensure post index adds the column
        const conn2 = new Connection({ client: 'sqlite3', connection: { filename: ':memory:' } });
        await conn2.connect();
        const repo2 = new Repository(conn2);

        class RefModel {
            static name = 'RefModel';
            static fields = {
                id: 'primary',
                kind: { type: 'reference', models: ['A', 'B'] },
            };
        }

        const M = repo2.register(RefModel);
        // Initialize model to attach Field instances
        M._init();
        const refField = M.fields.kind;
        const meta = refField.getMetadata();
        expect(meta.id_column).toBe('id');
        expect(meta.models).toEqual(['A', 'B']);

        const sql = await repo2.sync({ force: true, dryRun: true });
        await conn2.destroy();

        // Expect an ALTER TABLE adding our reference column post-create
        const alter = sql.find(s => /alter table/i.test(s) && /kind/i.test(s));
        expect(alter).toBeTruthy();
    });

    test('Datetime field: write/read/serialize/deserialize and metadata', () => {
        // Define a temp model with datetime
        class DModel { static name = 'DModel'; static fields = { id: 'primary', ts: { type: 'datetime', defaultToNow: false } } }
        const M = repo.register(DModel);
        M._init();
        const rec = M.allocate({});
        const f = M.fields.ts;

        const t = new Date('2023-01-01T00:00:00.000Z');
        rec.ts = t;
        expect(rec.ts instanceof Date).toBe(true);
        expect(f.serialize(rec)).toBe(t.getTime());

        rec.ts = '2024-02-02T03:04:05.000Z';
        expect(rec.ts instanceof Date).toBe(true);
        expect(f.serialize(rec)).toBe(new Date('2024-02-02T03:04:05.000Z').getTime());

        rec.ts = Date.UTC(2025, 0, 1);
        expect(rec.ts instanceof Date).toBe(true);
        expect(f.serialize(rec)).toBe(Date.UTC(2025, 0, 1));

        // null allowed
        rec.ts = null;
        expect(rec.ts).toBeNull();
        expect(f.serialize(rec)).toBe(null);

        // deserialize
        expect(f.deserialize(rec, Date.UTC(2020, 0, 1)) instanceof Date).toBe(true);
        expect(() => f.deserialize(rec, 'bad-date')).toThrow(/Invalid date value/);

        // metadata
        const meta = f.getMetadata();
        expect(meta.defaultToNow).toBe(false);
    });

    test('Enum field: constructor validation and read/write checks', () => {
        class EModel { static name = 'EModel'; static fields = { id: 'primary', status: { type: 'enum', values: ['A', 'B'], required: true } } }
        const M = repo.register(EModel);
        M._init();
        const rec = M.allocate({});
        const ef = M.fields.status;

        // default read is null (but field required will be enforced on write)
        expect(rec.status).toBeNull();

        // valid write
        rec.status = 'A';
        expect(rec.status).toBe('A');

        // invalid value
        expect(() => { rec.status = 'Z'; }).toThrow(/Invalid value for enum field/);

        // required enforcement
        expect(() => { rec.status = null; }).toThrow(/is required/);

        // constructor validation (missing values)
        class BadEnum { static name = 'BadEnum'; static fields = { x: { type: 'enum' } } }
        const badRepo = new Repository(conn); // reuse same connection
        expect(() => badRepo.register(BadEnum)._init()).toThrow(/must have a 'values' array/);
    });
});

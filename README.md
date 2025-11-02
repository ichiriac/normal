<div align="center">
<img src="docs/assets/normal-logo.svg" alt="Normal ORM" height="120" />

# NormalJS

The simple, straightforward, and most advanced Node.js ORM — without the bloat.

Build data-rich apps with clean models, powerful relations, and first-class DX. NormalJS blends a tiny API with serious capabilities: schema sync, relations (1:n, n:m), transactions, model extension, and active-record-style instances. All in plain JavaScript.

</div>

## Why NormalJS

- Simple: minimal surface area. Define models with a static `fields` object and go.
- Transaction-first: fully isolated repos inside transactions without leaking state.
- Advanced caching: centralized in-memory cache shared across child processes, with UDP-based clustering for peer invalidation.
- Powerful: relations (1:n, n:m), transactions, model mixins/extension, inheritance with discriminators, relation proxies.
- Productive: active records you can call methods on; lazy, ID-first reads that auto-hydrate fields; request-level caching with invalidation markers.
- Portable: works with Postgres and SQLite. Uses Knex under the hood.

### What makes NormalJS different for complex domains

- Extensible field system: add custom field types that control serialization, JSON output, schema, and lifecycle hooks.
- Model extension and overwrite: register multiple classes with the same `static name` to merge fields and attach static/instance behavior over time.
- Inheritance with discriminators: share a base model schema and behavior; allocate correct child records automatically.
- Schema sync (base synchronization): generate and evolve tables from model fields with migration-safe helpers.
- Clear split of responsibilities: simple static APIs for model-level operations, and instance methods/getters for active records.

## Install

```bash
npm install normaljs pg -y
```

## Database engines

NormalJS supports these SQL databases via Knex:

<div align="center">

<a href="https://www.postgresql.org/"><img alt="PostgreSQL" src="https://img.shields.io/badge/-PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white&logoSize=auto" /></a>
<a href="https://mariadb.org/"><img alt="MariaDB" src="https://img.shields.io/badge/-MariaDB-003545?style=for-the-badge&logo=mariadb&logoColor=white&logoSize=auto" /></a>
<a href="https://www.mysql.com/"><img alt="MySQL" src="https://img.shields.io/badge/-MySQL-4479A1?style=for-the-badge&logo=mysql&logoColor=white&logoSize=auto" /></a>
<a href="https://www.cockroachlabs.com/product/cockroachdb/"><img alt="CockroachDB" src="https://img.shields.io/badge/-CockroachDB-6933FF?style=for-the-badge&logo=cockroachlabs&logoColor=white&logoSize=auto" /></a>
<a href="https://www.sqlite.org/index.html"><img alt="SQLite" src="https://img.shields.io/badge/-SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white&logoSize=auto" /></a>
<a href="https://www.oracle.com/database/"><img alt="Oracle" src="https://img.shields.io/badge/-Oracle-F80000?style=for-the-badge&logo=oracle&logoColor=white&logoSize=auto" /></a>
<a href="https://www.microsoft.com/sql-server/"><img alt="Microsoft SQL Server" src="https://img.shields.io/badge/-Microsoft%20SQL%20Server-CC2927?style=for-the-badge&logo=microsoftsqlserver&logoColor=white&logoSize=auto" /></a>
<a href="https://aws.amazon.com/redshift/"><img alt="Amazon Redshift" src="https://img.shields.io/badge/-Amazon%20Redshift-8C4FFF?style=for-the-badge&logo=amazonredshift&logoColor=white&logoSize=auto" /></a>

</div>

Note: You only need the driver for the database(s) you use (e.g., `pg` for PostgreSQL, `sqlite3` or `better-sqlite3` for SQLite).

## 60‑second Quickstart

```js
// index.js
const { Connection, Repository } = require('normaljs');

// 1) Create a connection (SQLite in-memory shown; Postgres also supported)
const db = new Connection({ client: 'sqlite3', connection: { filename: ':memory:' } });

// 2) Define models (CommonJS)
class Users {
  static name = 'Users';
  static table = 'users';
  static fields = {
    id: 'primary',
    firstname: { type: 'string', required: true },
    lastname: { type: 'string', required: true },
    email: { type: 'string', unique: true, required: true },
    created_at: { type: 'datetime', default: () => new Date() },
    updated_at: { type: 'datetime', default: () => new Date() },
  };

  get name() {
    return `${this.firstname} ${this.lastname}`;
  }
}

class Posts {
  static name = 'Posts';
  static table = 'posts';
  static fields = {
    id: 'primary',
    title: { type: 'string', required: true },
    content: { type: 'string', required: true },
    author_id: { type: 'many-to-one', required: true, model: 'Users' },
  };
}

// 3) Register & sync
const repo = new Repository(db);
repo.register({ Users, Posts });
await repo.sync({ force: true });

// 4) Use it
const u = await repo
  .get('Users')
  .create({ firstname: 'Ada', lastname: 'Lovelace', email: 'ada@example.com' });
const p = await repo.get('Posts').create({ title: 'Hello', content: 'World', author_id: u.id });
console.log(u.name); // "Ada Lovelace"
```

### Modeling big domains, simply

Static methods live on models; instance methods live on records. You can extend models incrementally or inherit from a base model.

```js
// Extension: register the same model name again to add fields + behavior
class Users {
  static name = 'Users';
  static fields = { id: 'primary' };
}

// Extend Users with fields and static/instance APIs
class UsersExt {
  static name = 'Users';
  static fields = { email: 'string' };
  static byEmail(email) {
    return this.where({ email }).first(); // simple, model-scoped static API
  }
  get domain() {
    return this.email?.split('@')[1] || null; // instance API on active record
  }
}

// Inheritance: child model shares base structure and behavior
class Payment { static name = 'Payment'; static fields = { id: 'primary', amount: 'float' }; }
class CardPayment { static name = 'CardPayment'; static inherits = 'Payment'; static fields = { pan: 'string' }; }

repo.register(Users);
repo.register(UsersExt);       // extension merged
repo.register({ Payment, CardPayment });
```

## Features at a glance

- Models
  - Simple class with `static name`, `static table`, `static fields`.
  - Extension system: register multiple times with same `static name` to add/override fields and behavior.
  - Inheritance with discriminators for polymorphic models.
- Fields
  - Built-ins: primary, integer/float, string/text, boolean, date/datetime, enum, json, reference.
  - Constraints: `default`, `required`, `unique`, `index`.
  - Custom fields: implement serialization, JSON, schema, and lifecycle hooks.
- Relations
  - 1:n via `one-to-many` (e.g., `comments: { type: 'one-to-many', foreign: 'Comments.post_id' }`).
  - n:m via paired `many-to-many` (auto-join table).
  - Relation proxies on instances: `add`, `remove`, `load`.
  - **NEW**: Automatic join generation for relational filters (e.g., `where({ 'author.organization.name': 'ACME' })`).
- Transactions
  - `repo.transaction(async (tx) => { /* ... */ })` gives an isolated tx-bound repository.
  - Post-commit cache flush of changed records.
- Active records
  - Rows are wrapped into instances; instance methods and getters work naturally.
  - Default reads select only `id` (fast), with lazy hydration from cache/DB.
- Cache and discovery
  - Request-level caching via `.cache(ttl)` and entry cache per `Model:ID`.
  - Per-model invalidation markers (`$Model`) to evict request caches without dropping entry caches.
  - Centralized in-memory cache across processes with UDP-based clustering.
  - Discovery protocol auto-syncs peer list for invalidations.
- Schema sync
  - Create/update tables from model fields with `repo.sync()`.
  - Migration-safe helpers for column replacement and index updates.

See full field reference in `docs/fields.md`.

### More docs

- `docs/models.md` — Model definitions, inheritance, and extension system.
- `docs/fields.md` — Built-in field types and options.
- `docs/requests.md` — Request API, criteria DSL, and request-level caching.
- `docs/relational-filters.md` — **NEW**: Automatic joins for relational field filters.
- `docs/cache.md` — Cache architecture, connection options, discovery, and model cache options.
- `docs/custom-fields.md` — In-depth custom fields with hooks and a file-storage example.
- `docs/adoption-sequelize.md` — Step-by-step migration guide from Sequelize.

## Demo

Explore `demo/` for a working blog schema (Users, Posts, Tags, Comments) and a CRM and Stocks example.

## License

The MIT License (MIT)

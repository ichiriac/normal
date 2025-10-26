<div align="center">
<img src="docs/assets/normal-logo.svg" alt="Normal ORM" height="120" />

# NormalJS

The simple, straightforward, and most advanced Node.js ORM — without the bloat.

Build data-rich apps with clean models, powerful relations, and first-class DX. NormalJS blends a tiny API with serious capabilities: schema sync, relations (1:n, n:m), transactions, model extension, and active-record-style instances. All in plain JavaScript.

</div>

## Why NormalJS ?

- Simple: minimal surface area. Define models with a static `fields` object and go.
- Powerful: many-to-many via join tables, transactions, model mixins/extension, relation proxies.
- Productive: active records you can call methods on; defaults and lightweight ID-first queries out of the box.
- Portable: works with Postgres and SQLite (in-memory for tests). Uses Knex under the hood.

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

## Features at a glance

- Models: simple class with `static name`, `static table`, `static fields`.
- Fields: number, string, boolean, datetime, plus `default`, `required`, `unique`, `index`.
- Relations:
  - 1:n via `one-to-many` fields (e.g., `comments: { type: 'one-to-many', foreign: 'Comments.post_id' }`).
  - n:m via paired `many-to-many` fields referencing a join table name (created automatically).
  - Relation proxies on instances: `add`, `remove`, `load`.
- Transactions: `repo.transaction(async (tx) => { /* ... */ })` with a tx‑bound repository.
- Active records: reads wrap rows into instances (methods/getters work); default queries select only `id` for speed.
- Model extension: register classes with the same `static name` to add fields and methods/getters.

See full field reference in `docs/fields.md`.

## Demo

Explore `demo/` for a working blog schema (Users, Posts, Tags, Comments) and a CRM and Stocks example.

## License

The MIT License (MIT)

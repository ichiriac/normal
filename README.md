<div align="center">

# Normal

The simple, straightforward, and most advanced Node.js ORM — without the bloat.

Build data-rich apps with clean models, powerful relations, and first-class DX. Normal blends a tiny API with serious capabilities: schema sync, relations (1:n, n:m), transactions, model extension, and active-record-style instances. All in plain JavaScript.

</div>

## Why Normal?
- Simple: minimal surface area. Define models with a static `fields` object and go.
- Powerful: many-to-many via join tables, transactions, model mixins/extension, relation proxies.
- Productive: active records you can call methods on; defaults and lightweight ID-first queries out of the box.
- Portable: works with Postgres and SQLite (in-memory for tests). Uses Knex under the hood.

## Install
```bash
npm install normal pg sqlite3
```

## 60‑second Quickstart
```js
// index.js
const { Connection, Repository } = require('normal');

// 1) Create a connection (SQLite in-memory shown; Postgres also supported)
const db = new Connection({ client: 'sqlite3', connection: { filename: ':memory:' } });

// 2) Define models (CommonJS)
class Users {
	static name = 'Users';
	static table = 'users';
	static fields = {
		id: { type: 'number', primary: true, generated: true },
		firstname: { type: 'string', nullable: false },
		lastname: { type: 'string', nullable: false },
		email: { type: 'string', unique: true, nullable: false },
		created_at: { type: 'datetime', default: () => new Date() },
		updated_at: { type: 'datetime', default: () => new Date() },
	};

	get name() { return `${this.firstname} ${this.lastname}`; }
}

class Posts {
	static name = 'Posts';
	static table = 'posts';
	static fields = {
		id: { type: 'number', primary: true, generated: true },
		title: { type: 'string', nullable: false },
		content: { type: 'string', nullable: false },
		author_id: { type: 'number', nullable: false, foreign: 'Users.id' },
	};
}

// 3) Register & sync
const repo = new Repository(db);
repo.register({ Users, Posts });
await repo.sync({ force: true });

// 4) Use it
const u = await repo.get('Users').create({ firstname: 'Ada', lastname: 'Lovelace', email: 'ada@example.com' });
const p = await repo.get('Posts').create({ title: 'Hello', content: 'World', author_id: u.id });
console.log(u.name); // "Ada Lovelace"
```

## Features at a glance
- Models: simple class with `static name`, `static table`, `static fields`.
- Fields: number, string, boolean, datetime, plus `default`, `nullable`, `unique`, `foreign`.
- Relations:
	- 1:n via `collection` fields (e.g., `comments: { type: 'collection', foreign: 'Comments.post_id' }`).
	- n:m via paired `collection` fields referencing a join table name (created automatically).
	- Relation proxies on instances: `add`, `remove`, `load`.
- Transactions: `repo.transaction(async (tx) => { /* ... */ })` with a tx‑bound repository.
- Active records: reads wrap rows into instances (methods/getters work); default queries select only `id` for speed.
- Model extension: register classes with the same `static name` to add fields and methods/getters.

See full field reference in `docs/FIELDS.md`.

## Demo
Explore `demo/` for a working blog schema (Users, Posts, Tags, Comments) and a CRM and Stocks example.

## Testing
This repo uses Jest. Tests run against an in-memory SQLite database.

- Run tests
```bash
npm test
```

- Watch mode
```bash
npm run test:watch
```

- Coverage report
```bash
npm run test:coverage
```

## License

The MIT License (MIT)

# Models

Normal models are ES6 classes that declare metadata via static properties. They map to database tables, expose a fluent query API, and return active record instances (objects with getters/methods).

See fields reference in `docs/FIELDS.md` for all column types and relation options.

## Minimal example

```js
class Users {
	static name = 'Users';                 // Registry key (required)
	static table = 'users';                // DB table (optional; inferred from name)
	static cache = true;                   // Enable cache (true=default TTL, or a number in seconds)

	static fields = {
		id: 'primary',
		email: { type: 'string', unique: true, required: true },
		active: { type: 'boolean', default: true },
		created_at: { type: 'datetime', default: () => new Date() },
	};

	// Instance API works on active records
	get isStaff() { return this.email.endsWith('@example.com'); }
}
```

- `static name` is mandatory and used as the model key in the repository registry.
- `static table` defaults to a snake_cased form of `name` (e.g. `Users` -> `users`).
- `static cache` can be `true` (uses default TTL of 300s) or a number (TTL seconds). Disable per model by omitting or setting falsy. The global cache must also be enabled at the repository level via env; see `src/Repository.js`.

## Defining fields and relations

Declare columns and relations under `static fields`. See `docs/FIELDS.md` for full details. Quick summary:

- Primitives: `primary`, `integer|number`, `float`, `boolean`, `string`, `text`, `date`, `datetime|timestamp`, `enum`, `json`, `reference`.
- Relations:
	- Many-to-one: `{ type: 'many-to-one', model: 'OtherModel', cascade?: boolean }`
	- One-to-many: `{ type: 'one-to-many', foreign: 'ChildModel.fkField' }`
	- Many-to-many: `{ type: 'many-to-many', model: 'OtherModel', joinTable?: 'rel_custom' }`

Example with relations:

```js
class Posts {
	static name = 'Posts';
	static fields = {
		id: 'primary',
		title: { type: 'string', unique: true },
		content: { type: 'text', required: true },
		author: { type: 'many-to-one', model: 'Users' },
		tags:   { type: 'many-to-many', model: 'Tags' },
		comments: { type: 'one-to-many', foreign: 'Comments.post' },
	};
}
```

## Querying and active records

- `Model.query()` returns a query builder proxy. Chain any Knex method (e.g., `where`, `join`, `limit`, `orderBy`).
- `Model.where(...)` is a shorthand for `Model.query().where(...)`.
- `await Model.findById(id)` resolves an active record by id (uses in-memory identity map and cache when enabled).
- `await Model.firstWhere(cond)` returns the first matching record.

Results are wrapped into active record instances. With cache enabled, read queries initially select only `id` for performance; accessing other fields triggers batched fetching behind the scenes.

## Creating and flushing

- `await Model.create(data)` inserts a new record and returns an active record instance. Many-to-many collections can be pre-filled by setting the relation field to an array of ids (they are written after the main row is inserted).
- `await repo.flush()` persists pending changes across all models. `await model.flush()` flushes one model.

## Model extension (merging definitions)

You can register multiple classes with the same `static name` to extend a model across files or modules. Field declarations are merged; methods/getters are added to the active record class.

```js
// Base
class Users { static name = 'Users'; static fields = { id: 'primary' }; }

// Extension (adds fields + methods)
class UsersEx { static name = 'Users'; static fields = { picture: 'string' }; get profileUrl() { return `https://cdn/p/${this.picture}`; } }

repo.register(Users);
repo.register(UsersEx); // merged into a single model
```

Notes:
- If any of the registered classes declares `static cache = true|number`, the model’s cache TTL is set accordingly.
- If a class declares `static abstract = true`, the model becomes abstract (cannot be instantiated directly).

## Mixins (compose from other models)

A model can declare `static mixins = ['OtherModel', 'CommonBehavior']` to compose fields and behavior from other registered models. During initialization:
- the mixin model’s fields are merged
- the mixin’s active record class is chained so its instance methods/getters are available

```js
class Auditable { static name = 'Auditable'; static fields = { created_at: 'datetime', updated_at: 'datetime' }; }
class Posts { static name = 'Posts'; static mixins = ['Auditable']; static fields = { id: 'primary', title: 'string' }; }

repo.register(Auditable);
repo.register(Posts);
```

## Inheritance (class-table inheritance)

A child model can inherit from a parent using `static inherits = 'ParentModel'`. This implements class-table inheritance:

- The parent model gets a special reference column `_inherit` that stores the concrete subtype name.
- Creating a child first inserts into the parent table (with `_inherit` set), then inserts into the child table with the same `id`.
- The parent’s common fields live on the parent table; the child’s extra fields live on the child table.

```js
class Documents { static name = 'Documents'; static fields = { id: 'primary', title: 'string' }; }
class Invoices  { static name = 'Invoices';  static inherits = 'Documents'; static fields = { total: 'float' }; }

repo.register(Documents);
repo.register(Invoices);
```

Caveats:
- Only single inheritance is supported (one parent).
- Ensure both parent and child are registered before syncing.

## Caching behavior

- Enable per-model caching by setting `static cache = true` (default TTL 300s) or `static cache = <seconds>`.
- Repository-level cache must be enabled via environment variables; see `src/Repository.js` for full configuration (engine selection, sizing, metrics, cluster peers, etc.).
- Lookup batching optimizes id access; Request wrappers select only `id` on reads when caching is enabled to keep queries lightweight.

## Table naming and sync

- Table names default to a snake_cased version of the model name (no pluralization).
- `await repo.sync({ force: true })` creates or updates tables and relations based on model fields.
- Many-to-many join tables are auto-created as `rel_<left>_<right>` (lexicographic by table name) unless `joinTable` is specified.

## Tips

- Keep model classes small; move business logic into methods/getters on the active record when it directly relates to the entity.
- Use mixins for reusable field/method bundles (timestamps, soft-delete, auditing).
- Prefer many-to-one for FKs; expose one-to-many only on the parent side to avoid duplicate state.
- When caching is enabled, remember that writes in a transaction are flushed to cache after commit by the repository.

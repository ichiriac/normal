# Normal ORM - AI Coding Agent Instructions

## Architecture Overview

Normal is a lightweight Node.js ORM with active record patterns, built on Knex.js. Core components:

- **Repository**: Model registry and transaction coordinator (`src/Repository.js`)
- **Model**: Query builder and schema management (`src/Model.js`)
- **Record**: Active record instances with lazy field access (`src/Record.js`)
- **Connection**: Knex wrapper supporting PostgreSQL/SQLite (`src/Connection.js`)
- **Fields**: Type system with schema inference (`src/Fields.js`, `src/fields/`)

## Coding patterns

- Use SRP (Single Responsibility Principle) to keep models focused and manageable.
- DRY (Don't Repeat Yourself): Abstract common logic into base classes or utility functions.
- Avoid too high complexity in methods, favoring smaller, testable functions.
- Each method should have a clear purpose and single responsibility.
- Document with jsdoc annotations for functions and classes.
- Update tests during code changes to ensure coverage and correctness.
- We target at least 80% test coverage across the codebase

## Model Definition Patterns

Models are ES6 classes with static metadata:

```javascript
class Users {
  static name = 'Users'; // Registry key (required)
  static table = 'users'; // DB table name (optional, inferred from name)
  static fields = {
    id: 'primary', // Shorthand for { type: "number", primary: true, generated: true }
    email: { type: 'string', unique: true, required: true },
    posts: { type: 'one-to-many', foreign: 'Posts.author_id' }, // Relations
    tags: { type: 'many-to-many', model: 'Tags' }, // Auto-creates join table
  };

  // Instance methods/getters work on active records
  get name() {
    return `${this.firstname} ${this.lastname}`;
  }
}
```

## Relation Patterns

- **One-to-Many**: `{ type: "one-to-many", foreign: "ChildModel.fk_column" }`
- **Many-to-One**: `{ type: "many-to-one", model: "ParentModel" }` (creates FK column)
- **Many-to-Many**: Both sides use `{ type: "many-to-many", model: "OtherModel" }` (auto-creates join table)

## Model Extension System

Register multiple classes with the same `static name` to extend models:

```javascript
// Base model
class Users { static name = "Users"; static fields = { id: "primary" }; }

// Extension (adds fields + methods)
class Users { static name = "Users"; static fields = { picture: "string" }; get profileUrl() {...} }

repo.register(BaseUsers);
repo.register(ExtendedUsers);  // Merged into single model
```

## Development Workflow

**Setup**: `npm install` → Models use in-memory SQLite by default (no external DB needed)

**Testing**: `npm test` (Jest + SQLite in-memory), `npm run test:watch`, `npm run test:coverage`

**Demo Examples**:

- `demo/blog/` - Users/Posts/Tags/Comments with relations
- `demo/crm/` - Business workflow models
- `demo/stocks/` - Inventory/warehouse models
- Run: `cd demo/blog && node index.js`

## Key Implementation Details

- **Lazy Loading**: Queries select only `id` by default for performance; access other fields triggers batch loading
- **Transaction Isolation**: `repo.transaction(async tx => {...})` provides transaction-scoped repository
- **Schema Sync**: `await repo.sync()` creates/updates tables from model fields
- **Active Records**: Query results are wrapped instances with methods/getters, not plain objects

## Field Type Reference

- `"primary"` → `{ type: "number", primary: true, generated: true }`
- `"string"`, `"number"`, `"boolean"`, `"datetime"` → Basic types
- `{ default: () => new Date() }` → App-level defaults (not DB defaults)
- `{ enum: ["val1", "val2"] }` → App-level validation (not DB enum)

## Testing Conventions

- All tests use SQLite in-memory: `new Connection({ client: 'sqlite3', connection: { filename: ':memory:' } })`
- Register demo models from `demo/*/models/` for integration testing
- Use `repo.sync({ force: true })` to reset schema between tests

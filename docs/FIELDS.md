# Fields

Models declare fields via a static `fields` object on the class. Each entry describes the column type, constraints, defaults, and (optionally) relations.

Quick example (see demo models in `demo/models/`):
```js
class Users {
  static name = "Users";
  static table = "users";
  static fields = {
    id: { type: "number", primary: true, generated: true },
    firstname: { type: "string", unique: true, nullable: false },
    lastname: { type: "string", unique: true, nullable: false },
    email: { type: "string", unique: true, nullable: false },
    password_hash: { type: "string", nullable: false },
    active: { type: "boolean", default: true },
    created_at: { type: "datetime", default: () => new Date() },
    updated_at: { type: "datetime", default: () => new Date() },
  };
}
```

Supported field types
- number
  - Integer column. Use with `primary`/`generated` for autoincrement primary keys.
- string
  - Text column.
- boolean
  - Boolean column.
- date
  - Date-only. Runtime helper available; stored as `DATE` (or closest type by client).
- datetime / timestamp
  - Date-time values; mapped to `timestamp` without timezone by default.
- enum (runtime validation)
  - Use `type: "enum"` and `values: ["a","b"]` to enforce allowed values at runtime.
  - Note: schema is created as a string; there’s no DB-level enum in the current sync.
- manyToOne (runtime relation helper)
  - Use `type: "manyToOne"` and `refModel: <Model>` to make the property read/hydrate as a referenced record.
  - Creates an integer FK column with constraints at the runtime schema builder.
- collection (relation marker, Repository-driven)
  - Use `type: "collection"` with `foreign` to define one-to-many or many-to-many collections (see “Relations” below).
  - Not a database column; excluded from DDL.

Common field properties
- primary: boolean
  - Marks the field as primary key. If paired with `generated: true` on a `number` field, an autoincrement PK is created.
- generated: boolean
  - For `number` PKs; creates an autoincrement column.
- unique: boolean
  - Unique index on the column.
- nullable: boolean
  - When `false`, column is NOT NULL.
- default: value | () => value
  - If a function, it is applied at insert time in app code (not a DB default).
- index: boolean
  - Adds an index on the column.
- foreign: "ModelName.column"
  - Schema-level foreign key hint for plain scalar fields (commonly `number`).
  - Example: `{ type: "number", foreign: "Users.id" }`

Relations
1) Many-to-one (scalar FK on this table)
- Simple FK (schema-level only):
  ```js
  author_id: { type: "number", nullable: false, foreign: "Users.id" }
  ```
- With runtime hydration via field behavior:
  ```js
  author_id: { type: "manyToOne", refModel: Users, nullable: false }
  ```
  - Reads return an allocated `Users` record with `{ id }`.
  - Serializes to the underlying foreign key id on insert/update.

2) One-to-many (parent has a collection of child rows)
- Define a collection on the parent pointing to a registered child model and its FK:
  ```js
  comments: { type: "collection", foreign: "Comments.post_id" }
  ```
- Because `Comments` is a registered model, no join table is created.

3) Many-to-many (join table)
- Use a synthetic join table name that is not a registered model:
  ```js
  // Posts side
  tags: { type: "collection", foreign: "TagsPosts.post_id" }

  // Tags side
  posts: { type: "collection", foreign: "TagsPosts.tag_id" }
  ```
- The Repository will:
  - Create the join table `TagsPosts` (with `post_id`, `tag_id`) if both sides exist and the name does not collide with a real model/table.
  - Expose a collection proxy on instances:
    - `post.tags.add(tagOrId)`
    - `post.tags.remove(tagOrId)`
    - `await post.tags.load()`

Defaults
- Static values (DB default where supported):
  ```js
  active: { type: "boolean", default: true }
  ```
- Function values (applied in app code at insert time):
  ```js
  created_at: { type: "datetime", default: () => new Date() }
  ```

Notes and current behavior
- Schema creation is handled by the Repository from your static field specs. See [src/Repository.js](src/Repository.js).
- Runtime field behaviors (read/write/serialize) come from [src/Fields.js](src/Fields.js). Behavioral types include: `primary`, `boolean`, `date`, `datetime`/`timestamp`, `manyToOne`, `oneToMany`, `manyToMany`, and `enum`.
- `collection` is a Repository-level relation marker. Its methods are provided via relation proxies, not by `src/Fields.js`.
- `manyToMany` and `oneToMany` classes in `src/Fields.js` are placeholders for runtime behaviors; use `collection` with `foreign` as shown above for relations today.
- Enum: to enforce allowed values at runtime use:
  ```js
  status: { type: "enum", values: ["user", "admin", "moderator"] }
  ```
  The column is created as a string.

See also
- Fields implementation: [src/Fields.js](src/Fields.js)
- Model API: [src/Model.js](src/Model.js)
- Repository and relations: [src/Repository.js](src/Repository.js)
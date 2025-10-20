# Fields

Models declare fields via a static `fields` object on the class. Each entry describes the column type, constraints, defaults, and (optionally) relations.

Quick example (from `demo/models/Users.js`):
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
    // enum-like: string with allowed values (app-level only)
    status: { type: "string", default: "user", enum: ["user", "admin", "moderator"] },
    created_at: { type: "datetime", default: () => new Date() },
    updated_at: { type: "datetime", default: () => new Date() },
  };
}
```

Supported field types
The schema builder currently supports the following primitive types:

- number
  - Integer column. Use with `primary`/`generated` for autoincrement primary keys.
- boolean
  - Boolean column.
- datetime
  - Date-time values; mapped to a timestamp-like column (no timezone) by default.
- string
  - Text/varchar column. Any unknown `type` fallback is treated as string in schema.

Relations are defined via `collection` fields (see below). There isn’t a dedicated `enum` column type; instead, add an `enum: [...]` array on string fields to document/validate choices at the application level.

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
  - Foreign key hint for scalar fields (commonly `number`). Adds an index in schema; full FK constraints are intentionally minimal for portability.
  - Example: `{ type: "number", foreign: "Users.id" }`

Relations
1) Many-to-one (scalar FK on this table)
- Simple FK (schema-level only):
  ```js
  author_id: { type: "number", nullable: false, foreign: "Users.id" }
  ```
  Note: Access patterns are model-driven; repository creates the FK column based on `foreign`.

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

Examples from the demo
- Users owns posts and comments (one-to-many):
  ```js
  // demo/models/Users.js
  posts: { type: "collection", foreign: "Posts.author_id" },
  comments: { type: "collection", foreign: "Comments.author_id" },
  ```
- Posts has tags (many-to-many via TagsPosts) and comments (one-to-many):
  ```js
  // demo/models/Posts.js
  tags: { type: "collection", foreign: "TagsPosts.post_id" },
  comments: { type: "collection", foreign: "Comments.post_id" },
  ```
- Tags back-reference posts through the same join table:
  ```js
  // demo/models/Tags.js
  posts: { type: "collection", foreign: "TagsPosts.tag_id" },
  ```

Defaults
- Static values (DB default where supported):
  ```js
  active: { type: "boolean", default: true }
  ```
- Function values (applied in app code at insert time):
  ```js
  created_at: { type: "datetime", default: () => new Date() }
  ```

Extending models (demo/extend)
- You can extend a registered model by registering an additional class with the same `static name`, adding fields and methods/getters.
- Example adds an optional picture and a computed URL:
  ```js
  // demo/extend/Users.js
  class Users {
    static name = "Users";
    static fields = { picture: { type: "string", nullable: true } };

    get profilePictureUrl() {
      return this.picture
        ? `https://cdn.example.com/profiles/${this.picture}`
        : "https://cdn.example.com/profiles/default.png";
    }
  }
  module.exports = Users;
  ```

Notes and current behavior
- Schema creation is handled by the Repository from your static field specs. See [src/Repository.js](src/Repository.js).
- `collection` is a Repository-level relation marker. Its methods are provided via relation proxies on instances (add/remove/load).
- Enumerated choices are expressed by adding `enum: [...]` to a string field (no DB-native enum; validation is app-level).
- Read queries default to selecting only `id` unless you specify columns explicitly; results are wrapped via `model.allocate`.

See also
- Fields implementation: [src/Fields.js](src/Fields.js)
- Model API: [src/Model.js](src/Model.js)
- Repository and relations: [src/Repository.js](src/Repository.js)
# Fields

Models declare fields via a static `fields` object on the class. Each entry describes the column type, constraints, defaults, and (optionally) relations.

Quick example (from `demo/models/Users.js`):
```js
class Users {
  static name = "Users";
  static table = "users";
  static order = [["id", "desc"]];

  static fields = {
    id: "primary",
    firstname: "string" ,
    lastname: { type: "string", required: true },
    email: { type: "string", unique: true, required: true },
    password_hash: { type: "string", size: 64, required: true },
    active: { type: "boolean", default: true },
    posts: { type: "one-to-many", foreign: "Posts.author_id" },
    comments: { type: "one-to-many", foreign: "Comments.author_id" },
    status: {
      type: "string",
      default: "user",
      enum: ["user", "admin", "moderator"],
    },
    created_at: { type: "datetime", default: () => new Date() },
    updated_at: { type: "datetime", default: () => new Date() },
  };

  get name() {
    return `${this.firstname} ${this.lastname}`;
  }
}

```

## Supported field types

The schema builder currently supports the following primitive types:

- integer
  - Integer column. Accepts `unsigned` option
- boolean
  - Boolean column.
- datetime
  - Date-time values; mapped to a timestamp-like column (no timezone) by default.
- date
  - Date values
- string
  - varchar column

Relations are defined via `collection` fields (see below). There isn’t a dedicated `enum` column type; instead, add an `enum: [...]` array on string fields to document/validate choices at the application level.

## Common field properties

- unique: boolean
  - Unique index on the column.
- required: boolean
  - When `false`, column is NOT NULL.
- default: value | () => value
  - If a function, it is applied at insert time in app code (not a DB default).
- index: boolean
  - Adds an index on the column.

## Relations

1) Many-to-one (scalar FK on this table)
- Simple FK (schema-level only):
  ```js
  author_id: { type: "many-to-one", required: true, model: "Users" }
  ```
  Note: Access patterns are model-driven; repository creates the FK column based on `foreign`.

2) One-to-many (parent has a collection of child rows)
- Define a collection on the parent pointing to a registered child model and its FK:
  ```js
  comments: { type: "one-to-many", foreign: "Comments.post_id" }
  ```
- Because `Comments` is a registered model, no join table is created.

3) Many-to-many (join table)
- Use a synthetic join table name that is not a registered model:
  ```js
  // Posts side
  tags: { type: "many-to-many", model: "Tags" }

  // Tags side
  posts: { type: "many-to-many", model: "Posts" }
  ```

- The Repository will:
  - Create the join table `rel_posts_tags` (with `post_id`, `tag_id`) if both sides exist and the name does not collide with a real model/table.

  - Expose a collection proxy on instances:
    - `post.tags.add(tagOrId)`
    - `post.tags.remove(tagOrId)`
    - `await post.tags.load()`


## Defaults
- Static values (DB default where supported):
  ```js
  active: { type: "boolean", default: true }
  ```
- Function values (applied in app code at insert time):
  ```js
  created_at: { type: "datetime", default: () => new Date() }
  ```

## Extending models (demo/extend)
- You can extend a registered model by registering an additional class with the same `static name`, adding fields and methods/getters.
- Example adds an optional picture and a computed URL:
  ```js
  // demo/extend/Users.js
  class Users {
    static name = "Users";
    static fields = { 
      picture: { type: "string", required: false } 
    };

    get profilePictureUrl() {
      return this.picture
        ? `https://cdn.example.com/profiles/${this.picture}`
        : "https://cdn.example.com/profiles/default.png";
    }
  }
  module.exports = Users;
  ```

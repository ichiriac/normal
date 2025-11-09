---
id: fields
title: Fields Reference
---

# Fields

NormalJS ships a concise field type system: primary, string, number, boolean, date/datetime, enum, text, and relations.

Models declare fields via a static `fields` object on the class. Each entry describes the column type, constraints, defaults, and (optionally) relations.

Quick example:

```js
class Users {
  static _name = 'Users';
  static table = 'users';

  static fields = {
    id: 'primary', // auto-increment PK
    firstname: 'string',
    lastname: { type: 'string', required: true },
    email: { type: 'string', unique: true, required: true },
    password_hash: { type: 'string', size: 64, required: true },
    active: { type: 'boolean', default: true },
    status: { type: 'enum', values: ['user', 'admin', 'moderator'], default: 'user' },
    created_at: { type: 'datetime', default: () => new Date() },
    updated_at: { type: 'datetime', default: () => new Date() },
  };

  get name() {
    return `${this.firstname} ${this.lastname}`;
  }
}
```

## Supported field types

Primitive and special types supported by the schema builder and runtime:

- primary
  - Auto-increment integer primary key.
- integer (alias: number)
  - Integer column. Options: `unsigned: boolean`.
- float
  - Floating-point column. Options: `unsigned: boolean`, `precision`, `scale`.
- boolean
  - Boolean column.
- string
  - VARCHAR column. Options: `size` (default 255).
- text
  - TEXT column for large strings.
- date
  - Date (no time) column. Values are Date objects or ISO strings; serialized as ISO.
- datetime (alias: timestamp)
  - Timestamp column (no timezone). Values are Date objects; serialized as epoch millis.
- enum
  - Database enum column. Options: `values: string[]` (required).
- json
  - JSON column. Values are serialized/deserialized automatically.
- reference
  - Stored as string or enum depending on `models`. Options: `id_field` (default `id`), `models: string[]`.

## Common field properties

- unique: boolean
  - Unique index on the column.
- required: boolean
  - When `true`, column is NOT NULL; when omitted/false, column allows NULL.
- default: value | () => value
  - If a function, it’s applied at insert time in app code (not a DB default).
- index: boolean
  - Adds an index on the column (where supported for the type).

Per-type extras:

- string: `size`
- integer/float: `unsigned`, and for float: `precision`, `scale`
- enum: `values`
- reference: `id_field`, `models`

## Relations

1. Many-to-one (scalar FK on this table)

```js
// Post belongs to a User; cascade controls ON DELETE behavior
author: { type: "many-to-one", model: "Users", cascade: true }
```

This creates an integer `author` column referencing `users.id`. When `cascade: true`, foreign deletes cascade; when `false`, they set NULL.

2. One-to-many (parent has a collection of child rows)

```js
// User has many Posts via Posts.author
posts: { type: "one-to-many", foreign: "Posts.author" }
```

Use the pattern `ChildModel.fkFieldName`, where `fkFieldName` is the ManyToOne field name on the child model.

3. Many-to-many (join table)

```js
// Posts side
tags: { type: "many-to-many", model: "Tags" }

// Tags side
posts: { type: "many-to-many", model: "Posts" }
```

- A join table is created automatically as `rel_<left>_<right>` (lexicographic by table name), e.g. `rel_posts_tags` with `post_id`, `tag_id` PK.
- You can force a specific name via `joinTable: "my_join"`.
- Instances expose a collection wrapper:
  - `await post.tags.load()`
  - `await post.tags.add(tagOrId)`
  - `await post.tags.remove(tagOrId)`
  - `await post.tags.clear()`

## Defaults

- Static values (DB default where supported by the column type):
  ```js
  active: { type: "boolean", default: true }
  ```
- Function values (applied in app code at insert time):
  ```js
  created_at: { type: "datetime", default: () => new Date() }
  ```

## Validation

NormalJS enforces validation at two levels:

- Database constraints, driven by field options
  - required: adds NOT NULL on the column (throws on NULL during create/update)
  - unique: creates a UNIQUE index on the column (enforced by the DB)
- Application-level validators
  - validate: rules evaluated in application code before insert/update

Validation runs automatically during `Model.create()` and `record.flush()` for all stored fields.

### Required (NOT NULL)

```js
email: { type: 'string', required: true }
```

- Adds a NOT NULL constraint to the column.
- When the value is missing/null, an error is thrown during create/update.

### Unique (database unique index)

```js
email: { type: 'string', unique: true }
```

- Creates a UNIQUE index at schema sync.
- The database will reject duplicates; you’ll get a constraint error on insert/update if violated.

### String validators (validate option)

For `string` fields, you can attach validators via the `validate` option. These are checked in app code using the bundled validator library.

Supported rules include:

- isEmail
- isIP4 / isIP6
- isURL
- isDataURI
- isSemVer
- isHexColor
- isFQDN
- is: regex pattern must match
- not: regex pattern must NOT match

Examples:

```js
class Users {
  static _name = 'Users';
  static table = 'users';
  static fields = {
    id: 'primary',
    // Required + unique + email validator
    email: {
      type: 'string',
      required: true,
      unique: true,
      validate: { isEmail: true },
    },

    // Regex must match (starts with A followed by 2 digits)
    code: { type: 'string', validate: { is: /^A\d{2}$/ } },

    // Regex must NOT match (simple content filter)
    bio: { type: 'string', validate: { not: /forbidden|banned/i } },

    // IPv4 only
    ip4: { type: 'string', validate: { isIP4: true } },
  };
}
```

Notes:

- `validate` is evaluated in application code at create/update time; it does not add a database constraint.
- `required` and `unique` translate to real database constraints via schema sync.
- You can combine `required`, `unique`, and `validate` on the same field.

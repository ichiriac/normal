---
id: adoption-sequelize
title: Adoption guide: Sequelize → NormalJS
---

This guide helps you migrate an existing Sequelize codebase to NormalJS. It maps the core concepts and shows equivalent code for models, associations, queries, transactions, hooks, and more.

## Key differences at a glance

- Model definition: Sequelize uses `sequelize.define()` with `DataTypes`; NormalJS uses a class with a static `fields` object.
- Relations: Sequelize associations → NormalJS relation fields (`many-to-one`, `one-to-many`, `many-to-many`).
- Reads: NormalJS selects just `id` by default for speed, and lazily hydrates fields; you can enable request caching with `.cache(ttl)`.
- Extension and inheritance: NormalJS lets you extend models by re-registering them and supports inheritance with discriminators.
- Cache: NormalJS has a built-in in-memory cache (per-connection) with optional UDP clustering.
- Schema: NormalJS can sync tables from fields (good for prototyping); keep migrations for production.

## 1) Model definitions

Sequelize:

```js
const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  email: { type: DataTypes.STRING, unique: true, allowNull: false },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
});
```

NormalJS:

```js
class Users {
  static name = 'Users';
  static table = 'users';
  static fields = {
    id: 'primary',
    email: { type: 'string', unique: true, required: true },
    active: { type: 'boolean', default: true },
  };
}
repo.register(Users);
```

DataTypes mapping (typical):

- INTEGER → `integer` (or `primary` for PK)
- FLOAT/DECIMAL → `float`
- STRING → `string` (with `size`), TEXT → `text`
- BOOLEAN → `boolean`
- DATE/DATEONLY → `datetime`/`date`
- JSON → `json`

## 2) Associations → relation fields

Sequelize:

```js
User.hasMany(Post, { foreignKey: 'author_id' });
Post.belongsTo(User, { as: 'author', foreignKey: 'author_id' });
Post.belongsToMany(Tag, { through: 'rel_posts_tags' });
Tag.belongsToMany(Post, { through: 'rel_posts_tags' });
```

NormalJS:

```js
class Users {
  static name = 'Users';
  static fields = {
    id: 'primary',
    posts: { type: 'one-to-many', foreign: 'Posts.author_id' },
  };
}

class Posts {
  static name = 'Posts';
  static fields = {
    id: 'primary',
    author_id: { type: 'many-to-one', model: 'Users' },
    tags: { type: 'many-to-many', model: 'Tags', joinTable: 'rel_posts_tags' },
  };
}

class Tags {
  static name = 'Tags';
  static fields = { id: 'primary' };
}
```

On instances:

```js
const post = await repo.get('Posts').findById(1);
await post.tags.load();
await post.tags.add(tagOrId);
await post.tags.remove(tagOrId);
```

## 3) Queries and eager loading

Sequelize:

```js
const u = await User.findOne({ where: { email }, include: [{ model: Post, as: 'posts' }] });
```

NormalJS:

```js
const Users = repo.get('Users');
const u = await Users.where({ email }).include('posts').first();
```

Notes:

- `include()` accepts a string or array of relation names declared on the model.
- NormalJS requests can be cached: `.cache(60)`.

## 4) Transactions

Sequelize:

```js
await sequelize.transaction(async (t) => {
  await User.create({ email }, { transaction: t });
});
```

NormalJS:

```js
await repo.transaction(async (tx) => {
  await tx.get('Users').create({ email });
});
```

Inside a transaction, `tx` is an isolated repository. After commit, flushed records are pushed into the entry cache.

## 5) Hooks

Sequelize has model hooks like `beforeCreate`, `afterUpdate`, etc. In NormalJS, you typically attach behavior with field hooks and record lifecycle methods; and you can also extend models.

On fields (per value):

```js
class Users {
  static name = 'Users';
  static fields = {
    id: 'primary',
    email: { type: 'string' },
  };
}

// In a custom field class, you can override:
// pre_create, post_create, pre_update, post_update, pre_unlink, post_unlink
```

On records (per instance):

```js
// In your mixin/extension class
class Users {
  static name = 'Users';
  async post_create() {
    /* ... */
  }
  async pre_update() {
    /* ... */
  }
}
```

## 6) Class vs instance methods

Sequelize `classMethods` → NormalJS static methods on the model; Sequelize instance methods → instance methods/getters on the active record.

```js
class Users {
  static name = 'Users';
  static fields = { id: 'primary', email: 'string' };

  // class (model) API
  static byEmail(email) {
    return this.where({ email }).first();
  }

  // instance API
  get domain() {
    return this.email?.split('@')[1] || null;
  }
}
```

## 7) Validation

Sequelize uses validators in definitions. NormalJS includes basic validation (required/unique) and `StringField` validators. For richer validation, implement it in field `validate()` or in record hooks.

```js
static fields = {
  email: {
    type: 'string', required: true,
    validate: { isEmail: true }
  }
}
```

## 8) Scopes

Sequelize scopes can be translated into helper statics on the model:

```js
class Users {
  static active() {
    return this.where({ active: true });
  }
  static byDomain(domain) {
    return this.where({ email: { like: `%@${domain}` } });
  }
}
```

## 9) Migrations and schema sync

- For greenfield or prototyping, `await repo.sync({ force: true })` builds tables from fields.
- For production, keep using migrations. You can compare generated metadata and write migration scripts accordingly. Fields expose helpers like `replaceColumn()` for careful changes.

## 10) Caching

- Entry cache (`Model:ID`) is updated on create/update and expired on unlink.
- Request cache is opt-in: call `.cache(ttlSeconds)`.
- Per-model invalidation markers (`$Model`) let you evict request-level cache without dropping entry cache; call `Model.invalidateCache()` or set `static cacheInvalidation = true` to auto-invalidate after writes/unlinks.

Enable cache on a model by setting `static cache`:

```js
class Users {
  static name = 'Users';
  static fields = {
    id: 'primary',
    email: 'string',
  };
  static cache = 300;
}
```

## 11) Raw SQL

Sequelize: `sequelize.query(sql)` → NormalJS: `repo.cnx.raw(sql)` or `repo.cnx(table).where(...)`.

## 12) Migration checklist

1. Create a `Connection` and `Repository`; keep your database driver.
2. Translate each Sequelize model to a NormalJS class with `static name`, `static table`, and `static fields`.
3. Convert associations to relation fields (`many-to-one`, `one-to-many`, `many-to-many`).
4. Move class/instance methods to static methods and record methods/getters.
5. Map validators (use field `validate`, `required`, or custom logic).
6. Replace `include`/eager loading with `.include()`.
7. Replace raw transactions with `repo.transaction(async tx => { ... })`.
8. Decide on schema: use `repo.sync()` for prototyping; maintain migrations for production.
9. (Optional) Enable caching: set `static cache` on hot-read models and use `.cache(ttl)` on read queries; consider `static cacheInvalidation = true`.
10. Run tests and compare query semantics; leverage NormalJS’s lazy ID-first reads for performance.

## References

- Model definitions: see `docs/models.md`
- Field types: see `docs/fields.md`
- Requests and caching: see `docs/requests.md` and `docs/cache.md`
- Custom fields: see `docs/custom-fields.md`

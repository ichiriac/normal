---
id: hooks
title: Lifecycle Hooks and Events
---

# Lifecycle Hooks and Events

NormalJS provides lifecycle hooks on Active Records and Fields, plus event emitters at the model and field level. These let you implement business logic around create/update/delete, maintain denormalized values, or react to related changes.

At a glance

- Active Record hooks (instance methods on your record class)
  - pre_create, post_create
  - pre_update, post_update
  - pre_unlink, post_unlink
- Field hooks (methods on field instances)
  - pre_create(record), post_create(record)
  - pre_update(record), post_update(record)
  - pre_unlink(record), post_unlink(record)
  - change events via onChange(listener)
- Model events (EventEmitter on the Model)
  - 'create', 'update', 'unlink'

These run automatically during `Model.create(...)`, `record.flush()`, and `record.unlink()`.

## Execution order

### Create

When you call `await Model.create(data)`:

1. Record-level pre hook

- record.pre_create()
- For each field: field.pre_create(record)

2. Insert

- Each stored field validates and serializes its value
- Row is inserted

3. Post hooks

- For each field: field.post_create(record)
- record.post_create()
- Model emits: `model.events.emit('create', record)`

### Update (flush)

When you call `await record.write(data)` or `await record.flush()`:

1. Record-level pre hook

- record.pre_update()
- For each field: field.pre_update(record)

2. Update

- For each stored field, `field.validate(record)` and `field.serialize(record)`
- Only changed columns are updated
- Cache is updated if enabled

3. Post hooks

- For each updated field: field.post_update(record)
- record.post_update()
- Model emits: `model.events.emit('update', record)`

### Unlink (delete)

When you call `await record.unlink()`:

1. Record is immediately detached from its model (`_model = null`) for observable semantics
2. Pre hooks

- record.pre_unlink()
- For each field: field.pre_unlink(record)

3. Delete row

- If there is an inherited parent, it gets unlinked as well

4. Post hooks and events

- record.post_unlink()
- For each field: field.post_unlink(record)
- Model emits: `model.events.emit('unlink', record)`
- Cache entry is expired; optional model-level cache invalidation marker updated

## Implementing Active Record hooks

Hooks are instance methods of your record class (the `cls` used by the model). Define them on your model class if you extend the default Record, or add them via model extensions.

```js
class Users {
  static _name = 'Users';
  static fields = {
    id: 'primary',
    email: { type: 'string', required: true, unique: true },
    updated_at: { type: 'datetime', default: () => new Date() },
  };

  // Runs before inserting a new row
  async pre_create() {
    this.updated_at = new Date();
  }

  // Runs after updating an existing row
  async post_update() {
    // audit / side effects here
  }

  // Runs before deleting
  async pre_unlink() {
    // e.g., revoke access, log deletion
  }
}
```

All hook methods can be async and may read/write fields through normal property access.

## Field hooks and change listeners

Every field instance supports the same lifecycle hook names and a `change` event API.

- `pre_create(record)`, `post_create(record)`
- `pre_update(record)`, `post_update(record)`
- `pre_unlink(record)`, `post_unlink(record)`
- `onChange(listener)` — subscribe to changes of this field on a record; the listener is called with `(record, field)` when the value actually changes via `field.write`/property set.

Example: denormalize a computed field when a dependency changes

```js
class Posts {
  static _name = 'Posts';
  static fields = {
    id: 'primary',
    title: 'string',
    slug: {
      type: 'string',
      compute: function () {
        return this.title?.toLowerCase().replace(/\s+/g, '-');
      },
      stored: true,
      depends: ['title'],
    },
  };
}

// The String/Basic field base wires dependencies through Field.onChange internally.
// When 'title' changes, the computed 'slug' is recomputed and stored.
```

One-to-many relations also subscribe to child model events: they automatically attach to the related model's `create` and `unlink` to keep collections fresh.

## Model events

Every model has an EventEmitter (`model.events`) and a convenience `on(event, listener)` method:

```js
const Users = repo.get('Users');
Users.on('create', (rec) => console.log('user created', rec.id))
  .on('update', (rec) => console.log('user updated', rec.id))
  .on('unlink', (rec) => console.log('user deleted', rec.id));
```

Emitted events:

- `create` after a successful `Model.create`
- `update` after a successful `record.flush`
- `unlink` after a successful `record.unlink`

Tips:

- Prefer business logic in hooks, and use model events for cross-cutting concerns (metrics, logging, notifications).
- Hooks run inside the same request/transaction context as the create/update/delete operation.

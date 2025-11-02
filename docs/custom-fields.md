---
id: custom-fields
title: Custom fields
---

You can add your own field types by subclassing the base `Fields` and registering it under a `type` name.

This page shows:

- the field definition shape
- how to register your field
- available hooks
- a full example: a File field that stores a filename in DB while providing a small API to save/read content

## Field definition shape

Each field entry in a model’s `static fields` map is normalized into an object with these common keys:

- type: string (required) — your custom type name (lowercase), e.g. "file".
- column: string — DB column name (defaults to the field name).
- stored: boolean — whether the field is persisted (default true unless computed).
- compute: string | Function — computed field method (see computed fields).
- depends: string[] — dependencies (used by computed fields/reactivity).
- description: string — column comment.
- required: boolean — NOT NULL constraint.
- unique: boolean — unique index.
- index: boolean — index.
- default: any | () => any — app-level default if function, DB default if literal is supported by the column type.

Your custom type can accept extra keys; validate and use them in your subclass.

## Registering a custom field

Exported entry point exposes a `Fields` handle that maps `type` to a Field class via `behaviors`:

```js
const { Fields } = require('normaljs');

class MyCoolField extends Fields {
  // ... extend base Field (see below)

  getMetadata() {
    const meta = super.getMetadata();
    // define here allowed options
    meta.someOption = this.definitions.someOption;
    return meta;
  }

  // the column defition from the database
  getColumnDefinition(table) {
    return table.string(this.column, 255);
  }
}

Fields.behaviors['mycool'] = MyCoolField;
```

Now you can use it in any model:

```js
class Docs {
  static name = 'Docs';
  static fields = {
    id: 'primary',
    title: 'string',
    blob: { type: 'mycool', someOption: 123 },
  };
}
```

Notes:

- The `type` lookup is done by `Field.define` using `Fields.behaviors[type]`.
- The exported `Fields` from the package is the base `Field` class; attaching to `Fields.behaviors` is the supported registration mechanism.

## Extending Field: key methods

Subclass the base `Field` and override what you need:

- attach(model, cls): add getters/setters to the ActiveRecord prototype (base does this for you).
- read(record): how to read value from record; base handles changes/defaults/compute.
- write(record, value): how to set value on record; emit change events when modified.
- serialize(record): value to store in DB (default is `read()`).
- deserialize(record, value): transform DB value into runtime value.
- toJSON(record): transform value for JSON output (default is serialize).
- getColumnDefinition(knexTable): return the Knex column builder (required for stored fields).
- buildColumn/ buildIndex/ buildPostIndex: advanced schema migration hooks (optional).
- validate(record): throw if invalid (base handles `required`).

Runtime hooks you can override:

- pre_create(record), post_create(record)
- pre_update(record), post_update(record)
- pre_unlink(record), post_unlink(record)

These run during the Record lifecycle and allow side effects (e.g., clean up external resources on unlink).

## Example: File field (filename in DB, content on disk)

Goal: store only the filename in the DB column, but expose an object that lets you save/read file contents. This keeps DB light while providing a nice API.

```js
const fs = require('node:fs/promises');
const path = require('node:path');
const { Fields } = require('normaljs');

// Minimal storage helper
class DiskStorage {
  constructor({ dir }) {
    this.dir = dir;
  }
  async save(filename, data) {
    const full = path.join(this.dir, filename);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
    return full;
  }
  async read(filename) {
    const full = path.join(this.dir, filename);
    return await fs.readFile(full);
  }
}

// Small handle exposed to app code (record.file.save/read)
class FileHandle {
  constructor(storage, nameRef) {
    this._storage = storage; // DiskStorage
    this._nameRef = nameRef; // getter/setter closure to record field
  }
  get filename() {
    return this._nameRef.get();
  }
  set filename(v) {
    this._nameRef.set(v);
  }
  async save(bufferOrString, name) {
    const fname = name || this.filename || Date.now() + '.bin';
    await this._storage.save(fname, bufferOrString);
    this.filename = fname; // persists through record write/flush
    return fname;
  }
  async read() {
    if (!this.filename) return null;
    return await this._storage.read(this.filename);
  }
}

class FileField extends Fields {
  constructor(model, name, def) {
    super(model, name, def);
    this.storage = def.storage; // instance of DiskStorage (or similar)
    if (!this.storage) throw new Error(`FileField '${name}' requires a storage`);
  }

  getMetadata() {
    const meta = super.getMetadata();
    meta.storage = this.definition.storage;
    return meta;
  }

  // Column is VARCHAR(255)
  getColumnDefinition(table) {
    return table.string(this.column, 255);
  }

  // From DB value (string) to a FileHandle facade
  deserialize(record, value) {
    // Track underlying filename in record storage
    record._data[this.column] = value || null;
    // Return a facade that mutates the underlying filename when saved
    return new FileHandle(this.storage, {
      get: () => record._data[this.column],
      set: (v) => {
        record._changes[this.column] = v;
        record._isDirty = true;
        this.events.emit('change', record, this);
      },
    });
  }

  // Expose handle on read()
  read(record) {
    // If already have a FileHandle, return it
    const cur = record._changes[this.column] ?? record._data[this.column];
    if (cur instanceof FileHandle) return cur;
    // If `cur` is a string (filename), wrap it; if null -> null
    if (typeof cur === 'string' || cur == null) {
      return this.deserialize(record, cur);
    }
    return cur;
  }
}

Fields.behaviors['file'] = FileField;

// Usage in a model
class Attachments {
  static name = 'Attachments';
  static fields = {
    id: 'primary',
    title: 'string',
    // Store filename in DB, expose `record.file.save/read()` in code
    file: { type: 'file', storage: new DiskStorage({ dir: 'uploads' }) },
  };
}

// App code
const att = await repo.get('Attachments').create({ title: 'Doc' });
await att.file.save(Buffer.from('hello world'), 'hello.txt');
await att.flush(); // persists the filename
const buf = await att.file.read();
```

### Hooks with file field

You can clean up external resources during unlink:

```js
class FileField extends Fields {
  // ...as above
  async post_unlink(record) {
    const name = record._data[this.column];
    if (!name) return;
    try {
      await fs.unlink(path.join(this.storage.dir, name));
    } catch {}
  }
}
```

This demonstrates how a field can manage non-DB resources while the DB stores only a simple string.

See `src/fields/*.js` for examples and mirror their minimal interface.

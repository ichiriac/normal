# Schema Sync Demo

This demo shows how NormalJS ORM synchronizes your database schema from model definitions. It illustrates:

- Fresh create with force (drop-and-recreate)
- Adding a new field (column)
- Changing a field type
- Using dry runs to preview SQL without applying changes
- Showing a no-op sync when nothing changed

Files:

- `index.js` – runs the progressive schema changes and prints SQL statements
- `models/User.js`, `models/Group.js` – initial model definitions

## How it works

Normal’s `Repository.sync(options)` delegates to the internal schema synchronizer and returns the SQL statements it would (or did) execute. Useful options:

- `force: true` – drop-and-recreate tables from scratch
- `dryRun: true` – compute and return SQL without applying it (wrapped in a transaction that is rolled back)

The synchronizer also tracks model metadata in a system table (`sys_models`) so it can compute diffs between current DB schema and new model definitions.

## Run the demo

```bash
cd demo/schema
node index.js
```

You’ll see sections like:

```
=== Initial create (force: true) ===
-- SQL to create all tables

=== Add field Users.age (dryRun) ===
-- Preview only (no changes applied)

=== Add Groups.notes (string) and apply ===
-- Apply adding a new column

=== Change Groups.notes type to text (dryRun only) ===
-- Preview safe type change plan (rename old column, add new typed column, attempt data copy)

=== No changes (dryRun) ===
(no statements)
```

## What it demonstrates

- Model extension: `Users.extends({...})` adds a new `age` field, then we sync.
- Type change (safe flow): Normal supports type modifications by:
  1.  renaming the old column (e.g. `notes` → `notes_mig_tmp`),
  2.  creating the new column with the target type,
  3.  attempting to migrate data using the database’s type conversion.
      If the conversion fails, the previous column remains available so data can be restored.
- Dry run safety: inspect SQL before applying; great for CI/migrations.
- Idempotency: when there are no model changes, sync returns no statements.

## Notes and tips

- Type changes are supported: Normal performs a rename → add → migrate flow. Engines like SQLite may present this as `rename` + `add` operations, with a best-effort data copy using DB type conversion. If the copy fails, the temporary column (e.g. `*_mig_tmp`) remains so you can safely restore data.
- Persistent DB file: the demo uses `schema.db` so you can re-run and see diffs. Delete it to start over.
- System table: `sys_models` stores the last applied model schema allowing precise diffs on future syncs.

## Try your own changes

- Add a new field to `User` or `Group` by extending the model in `index.js`.
- Remove a field from the extension to observe drop/alter behavior.
- Add a brand new model file and register it to see create table statements.

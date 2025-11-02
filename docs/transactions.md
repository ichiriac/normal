---
id: transactions
title: Transactions, Locking, and Flushing
---

# Transactions, Locking, and Flushing

NormalJS wraps Knex transactions and coordinates record flushing and cache updates for you. This page explains how to run work in a transaction, how locking fits in, and what gets flushed when.

## Running a transaction

Use `Repository.transaction(work, { isolationLevel? })`. Inside, you receive a transaction-scoped repository (txRepo) that shares your model definitions and cache, but all DB operations run on the single transaction.

```js
const result = await repo.transaction(async (tx) => {
  const Users = tx.get('Users');

  // Create/update/unlink rows as usual
  const u = await Users.create({ email: 'a@example.com' });
  u.firstname = 'Ada';
  await u.flush();

  // Queries inside the same tx
  const again = await Users.findById(u.id);
  return again.id;
}, { isolationLevel: 'read committed' });
```

Notes:

- The default isolation level is `read committed` on non-SQLite clients. You may pass any isolation supported by your driver/Knex dialect.
- Models are re-registered on the txRepo to ensure all operations are bound to the transaction.
- txRepo.flush() is called automatically before commit, ensuring pending changes are persisted.
- On error, the transaction is rolled back and the error is rethrown.

## Flushing and caching semantics

Flushing refers to pushing in-memory changes to the database and synchronizing caches.

- Record.flush(): updates only the changed stored fields, validates them, runs pre/post hooks, and updates the model cache.
- Model.flush(): flushes all dirty records of a single model instance.
- Repository.flush(): flushes all non-abstract models.

In transactions:

- The transaction wrapper calls `txRepo.flush()` just before `COMMIT`.
- After a successful commit, NormalJS performs an additional pass to write committed records into the cache (using an internal `_flushed` marker on records). This ensures cache coherence with committed data.
- Request-level caches (per-query) respect per-model invalidation markers. Use `Model.invalidateCache()` (or `static cacheInvalidation = true`) if you want cache eviction wired to create/update/unlink.

Outside transactions:

- `record.flush()` updates both the row and the model cache immediately.

## Locking strategy

NormalJS delegates locking to the database engine. You can opt into pessimistic locks by using Knex’s `.forUpdate()` / `.forShare()` (dialect-specific) on requests inside a transaction.

```js
await repo.transaction(async (tx) => {
  const Users = tx.get('Users');
  const user = await Users.query()
    .where({ id: 123 })
    .forUpdate()      // lock the row until commit
    .first();

  user.balance = user.balance - 10;
  await user.flush();
});
```

Recommendations:

- Always acquire locks inside a transaction; most dialects require it.
- SQLite does not support row-level locks; it uses database/page-level locks — design accordingly.
- NormalJS does not add optimistic locking automatically. If you need it, add a version/timestamp field and enforce checks in hooks or via middleware.

## Requests and transactions

Requests are thin proxies over Knex query builders. When you call `.query()` or `.where()` via a txRepo model, the resulting request runs on the same transaction.

Additional notes:

- Requests do default column selection (IDs or full columns) and `DISTINCT` when joins are present to avoid duplicate parent rows.
- You can chain any Knex method, including `.forUpdate()` and `.forShare()`.
- Use `.include(relations)` to pre-load one-to-many/many-to-many relations after the main rows are allocated.

## Hooks inside transactions

All lifecycle hooks (record and field hooks) run within the same transaction context as the surrounding operation. See the [Hooks](hooks) page for details.

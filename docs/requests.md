---
id: requests
title: Requests
---

Requests wrap Knex query builders and return active records:

```js
const Users = repo.get('Users');
const rows = await Users.where({ email: 'a@example.com' });
const one = await Users.query().firstWhere({ id: 1 });
```

Use propertie names to request. To retrieve the knex query builder use `query()` method.

- `where()` is a shorthand for `query().where()`
- `findOne` and `firstWhere` are shorthands to `where(criteria).first()`
- `findByPk` and `findById` expect the ID value as argument and will return the record instance

## Criteria

Use the JSON DSL to express filters; see [Filtering](filtering).

```js
const Users = repo.get('Users');
const rows = await Users.where({
  email: 'a@example.com',
  last_sent: {
    gt: new Date('2025-01-01 00:00:00'),
  },
});
```

## Caching

The requests results can be cached (if the cache is enabled). The TTL is required and indicates the duration in seconds that the cache have to live.

```js
const popular = await Users.query().where('active', true).cache(60);
```

In order to speed up the sql engine and keep cache lightweight only IDs are retrieved, records values are retrieved from the cache store or from the database.

Creating, writing or unlinking a record may invalidates the cache consistency. In ordre to evict cache related to an model use `Model.invalidateCache()` or to automatically invalidate the cache from records actions use `static cacheInvalidation = true;` on the model.

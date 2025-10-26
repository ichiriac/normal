---
id: requests
title: Requests
---

Requests wrap Knex query builders and return active records:

```js
const Users = repo.get('Users');
const rows = await Users.where({ email: 'a@example.com' });
const one = await Users.firstWhere({ id: 1 });
```

Criteria

Use the JSON DSL to express filters; see [Filtering](filtering).

Caching

```js
const popular = await Users.query().where('active', true).cache(60);
```

---
id: cookbook
title: Cookbook
---

Recipes you can copy-paste:

- Create and fetch

```js
const Users = repo.get('Users');
const u = await Users.create({ email: 'a@example.com' });
const found = await Users.findById(u.id);
```

- Simple filtering

```js
const posts = await repo.get('Posts').where({ and: [ ['author_id','=',u.id], ['published','=',true] ] });
```

- Relations

```js
// One-to-many
const posts = await u.posts.where({ published: true });
```

- Transactions

```js
await repo.transaction(async (tx) => {
  const Users = tx.get('Users');
  await Users.create({ email: 'tx@example.com' });
});
```

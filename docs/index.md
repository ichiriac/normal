---
id: index
title: NormalJS ORM
slug: /
---

NormalJS is a full-featured Node.js ORM built on Knex.js with an active record pattern.

- Define models with a simple fields DSL
- Query with a fluent API or JSON criteria
- Lazy-loading with batched lookups and optional cache
- Relations: one-to-many, many-to-one, many-to-many
- Model extensions (mixins) and inheritance
- Native cache support (support forks and clustering synchronisation)
- Schema sync to create/update tables

Quickstart

```js
const { Connection, Repository } = require('normaljs');

const conn = new Connection({ client: 'sqlite3', connection: { filename: ':memory:' } });
await conn.connect();
const repo = new Repository(conn);

class Users { static name = 'Users'; static fields = { id: 'primary', email: 'string' } }
repo.register(Users);
await repo.sync({ force: true });

const u = await repo.get('Users').create({ email: 'a@example.com' });
```

What’s next

- See common [use cases](use-cases)
- Try the [cookbook](cookbook)
- Learn [model definitions](models) and [fields](fields)
- Explore [requests](requests), [mixins](mixins) and [inheritance](inheritance)
- Implement [custom fields](custom-fields)
- Use JSON [filtering](filtering)
 - Migrate from Sequelize: [adoption guide](adoption-sequelize)

---
id: inheritance
title: Inheritance
---

Child models can inherit from a parent and share the same id across tables. Reads auto-join parent fields; writes split by owning table.

```js
class Contact {
  static _name = 'Contact';
  static fields = {
    id: 'primary',
    class: { type: 'reference' },
    first_name: 'string',
    last_name: 'string',
  };
}
class User {
  static _name = 'User';
  static inherits = 'Contact';
  static fields = { email: 'string', password_hash: 'string' };
}
repo.register(Contact);
repo.register(User);
```

See the CRM demo and the integration tests for end-to-end examples.

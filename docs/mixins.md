---
id: mixins
title: Mixins (Extensions)
---

Extend models by registering multiple classes with the same static name. Instance methods and fields are merged; statics are attached with super support.

```js
class Users { static name = 'Users'; static fields = { id: 'primary' }; }
class UsersExtra { static name = 'Users'; get label() { return this.email; } }
repo.register(Users); repo.register(UsersExtra);
```

See tests around extendModel for conflict-avoidance and performance.

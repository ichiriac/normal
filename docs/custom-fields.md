---
id: custom-fields
title: Custom fields
---

You can implement custom field types by subclassing the base field and wiring serialize/deserialize and schema hooks.

Key methods:

- attach(model, cls)
- serialize(record)
- deserialize(record, value)
- pre_create(record) / post_create(record)

See `src/fields/*.js` for examples and mirror their minimal interface.

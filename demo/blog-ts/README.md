# Blog Demo (TypeScript)

This is the TypeScript port of the NormalJS Blog demo.

## Run

1. Build the demo

   npm run demo:blog:ts:build

2. Run the main demo

   npm run demo:blog:ts

3. Run the relational filters demo

   npm run demo:blog:ts:filters

## Notes

- Uses an in-memory SQLite database; no setup needed.
- The demo destroys the DB connection before exit to avoid hanging.
- Models are plain classes consumed by Normal’s repository; instance methods are mixins on ActiveRecord. For simplicity, we avoid using `super` in mixin methods and expose helpers instead (see `Users.touch()` and `Users.deactivate()`).

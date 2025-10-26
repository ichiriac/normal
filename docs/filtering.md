---
id: filtering
title: Filtering (criteria DSL)
---

# Filtering and criteria syntax

This document explains all supported ways to filter records with NormalJS, from simple object filters to a JSON‑serializable criteria DSL with logic gates and operators that maps cleanly to SQL (via Knex).

The goals of the filtering DSL are:

- JSON‑only and portable (easy to store, send over HTTP, and test)
- Expressive: supports AND/OR/NOT and common operators (eq, in, gt, between, like, null checks, …)
- Safe: parameterized under the hood (no string concatenation)
- Dialect‑aware: small differences bridged where sensible (e.g., case‑insensitive matching)

## Quick start

You can filter in three complementary ways:

1. Simple Knex‑style object filter (equality only)

```js
// WHERE status = 'active' AND org_id = 42
await repo.get('Users').where({ status: 'active', org_id: 42 });
```

2. Chained query builder methods (full Knex power)

```js
await repo
  .get('Orders')
  .query()
  .where('total_amount', '>', 100)
  .whereIn('state', ['draft', 'confirmed'])
  .orderBy('created_at', 'desc')
  .limit(50);
```

3. JSON Criteria (recommended for UI/API payloads)

```json
{
  "and": [
    { "state": { "in": ["draft", "confirmed"] } },
    { "total_amount": { "gt": 100 } },
    {
      "or": [
        { "created_at": { "gte": "2024-01-01T00:00:00Z" } },
        { "customer_name": { "ilike": "%smith%" } }
      ]
    }
  ]
}
```

Use the JSON Criteria with a tiny helper that walks the object and applies it to a Knex query. See mapping details below.

## JSON Criteria grammar

Top‑level object supports two kinds of entries:

- Logic gates: `and`, `or` (array of criteria), `not` (single criteria)
- Field predicates: `fieldName: scalar | { op: value, ... }`

Field names can be unqualified (e.g., `status`) or qualified (`table.column`) when joining.

Supported operators on fields:

- Equality group: `eq`, `ne` (shorthand: `{ field: value }` means `eq`)
- Range: `gt`, `gte`, `lt`, `lte`
- Sets: `in`, `nin` (value must be array)
- Between: `between`, `nbetween` (two‑element array)
- Pattern: `like`, `ilike` (dialect note below)
- Nullability: `null` (true = IS NULL, false = IS NOT NULL), `notNull` (true = IS NOT NULL, false = IS NULL)

Examples:

```json
{ "id": 10 }
{ "price": { "gte": 50, "lt": 200 } }
{ "sku": { "in": ["A1","A2","A3"] } }
{ "deleted_at": { "null": true } }
{ "name": { "like": "%Pro%" } }
{ "name": { "ilike": "%smith%" } }
{ "and": [ { "org_id": 1 }, { "or": [ { "role": "admin" }, { "role": "owner" } ] } ] }
```

## Mapping to Knex

The following table shows how each operator maps to Knex calls:

- `eq` → `qb.where(col, value)`
- `ne` → `qb.whereNot(col, value)`
- `gt` → `qb.where(col, '>', value)`
- `gte` → `qb.where(col, '>=', value)`
- `lt` → `qb.where(col, '<', value)`
- `lte` → `qb.where(col, '<=', value)`
- `in` → `qb.whereIn(col, values)`
- `nin` → `qb.whereNotIn(col, values)`
- `between` → `qb.whereBetween(col, [a, b])`
- `nbetween` → `qb.whereNotBetween(col, [a, b])`
- `like` → `qb.where(col, 'like', pattern)`
- `ilike` →
  - PostgreSQL/Redshift: `qb.whereILike(col, pattern)`
  - Others: `qb.where(raw('LOWER(??) LIKE LOWER(?)', [col, pattern]))`
- `null` (true) → `qb.whereNull(col)`; (false) → `qb.whereNotNull(col)`
- `notNull` (true) → `qb.whereNotNull(col)`; (false) → `qb.whereNull(col)`

Logic gates:

- `and: [c1, c2, …]` → `qb.where(sub => { apply(c1); apply(c2); … })`
- `or: [c1, c2, …]` → `qb.where(sub => { apply(c1); sub.orWhere(() => apply(c2)); … })`
- `not: c` → `qb.whereNot(sub => apply(c))`

## Helper: apply JSON Criteria to a query

Usage with a model request:

```js
const { applyCriteria } = require('../src/utils/criteria');

const criteria = {
  and: [{ 'orders.state': { in: ['draft', 'confirmed'] } }, { 'orders.total_amount': { gt: 100 } }],
};

const Orders = repo.get('Orders');
const rows = await Orders.where(criteria);
```

## Relation filters in field definitions

For relation fields that support filtering (e.g., one‑to‑many or many‑to‑one), you can specify a `where` option as either a plain object or a Criteria JSON object.

```js
// Example: filter a one‑to‑many to only “public” comments
comments: {
  type: 'one-to-many',
  foreign: 'Comments.post_id',
  where: { is_public: true }
}

// Or with the JSON Criteria DSL
lines: {
  type: 'one-to-many',
  foreign: 'sale_lines.sale_id',
  where: { and: [ { status: 'ok' }, { quantity: { gt: 0 } } ] }
}
```

## Column qualification and joins

When filtering joined queries (e.g., inherited models or manual joins), qualify columns with `table.column` to avoid ambiguity:

```json
{
  "and": [
    { "users.email": { "ilike": "%@example.com" } },
    { "contacts.first_name": { "ilike": "Jane%" } }
  ]
}
```

NormalJS’s inherited models may auto‑join parent tables on reads; qualifying avoids ambiguous column errors when names overlap.

## Dialect notes

- `ilike` is native on PostgreSQL/Redshift. On other dialects the helper emulates case‑insensitive LIKE via `LOWER(col) LIKE LOWER(?)`. Consider adding functional or computed indexes for performance.
- Date/time comparisons should use ISO strings or numbers (epoch ms) compatible with your dialect and column type.
- `between` bounds are inclusive on most engines.

## Performance tips

- Prefer equality, IN, and range operators on indexed columns.
- Qualify columns when joining to keep the planner effective and avoid unexpected cross‑refs.
- Avoid deeply nested ORs when possible; consider denormalization or search indices for complex text queries.

## Error handling and validation

- Unknown operators are ignored by the helper; validate criteria upfront if you need strictness.
- Ensure arrays are provided for `in`/`nin`/`between`.
- Treat untrusted input carefully; the helper uses parameter binding to avoid injection, but you should still whitelist fields where appropriate.

## Examples

Case‑insensitive customer search within a date range:

```json
{
  "and": [
    { "created_at": { "between": ["2025-01-01", "2025-12-31"] } },
    { "customer_name": { "ilike": "%smith%" } },
    { "state": { "in": ["confirmed", "shipped"] } }
  ]
}
```

Null vs not null:

```json
{ "deleted_at": { "null": true } }
{ "deleted_at": { "notNull": true } }
```

Nested logic with joins:

```json
{
  "and": [
    { "users.org_id": 7 },
    {
      "or": [{ "contacts.city": { "eq": "Paris" } }, { "contacts.country": { "eq": "FR" } }]
    }
  ]
}
```

# Indexes Demo

This demo showcases the model-level indexes and unique constraints feature in NormalJS.

## Running the Demo

```bash
node demo/indexes/index.js
```

## What's Demonstrated

### 1. Composite Unique Constraints

Shows how to enforce uniqueness across multiple fields (username + domain).

### 2. Simple Array Syntax

Demonstrates the shorthand array syntax for defining basic indexes.

### 3. Partial Indexes

Examples of partial indexes with predicates (WHERE clauses) to index only rows matching certain conditions.

### 4. Field Name Resolution

Shows how field names are automatically resolved to their corresponding database column names.

### 5. Field-level vs Model-level Indexes

Compares field-level `unique: true` with model-level composite unique constraints.

## Key Features

- **Composite indexes**: Index multiple fields together
- **Unique constraints**: Enforce uniqueness at database level
- **Partial indexes**: Index only rows matching predicates (PostgreSQL/SQLite)
- **Array syntax**: Simple shorthand for basic indexes
- **Column resolution**: Automatic field-to-column name mapping

## Example Output

```
=== NormalJS Indexes Demo ===

1. Composite Unique Constraint:
  ✓ Created account: john@example.com
  ✓ Created account: john@other.com
  → Same username allowed on different domains
  ✗ Duplicate username+domain rejected (unique constraint works!)

2. Simple Array Syntax:
  ✓ Created indexes on: sku, [category, name]

3. Partial Indexes:
  ✓ Created partial index on active tasks (completed_at IS NULL)
  ✓ Created partial index on high priority tasks (priority >= 8)
```

See `docs/models.md` for complete documentation on the indexes feature.

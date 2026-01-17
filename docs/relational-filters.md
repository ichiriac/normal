# Relational Field Filters with Automatic Joins

NormalJS now supports filtering by relational field names using dot-notation. The ORM automatically generates the necessary SQL joins based on your model relationships.

## Features

- **Automatic Join Generation**: No need to manually specify joins - they're created automatically
- **Field Name Mapping**: Use field names (e.g., `author_id.firstname`) instead of table.column syntax
- **Multi-Level Joins**: Chain through multiple relationships (e.g., `author_id.organization_id.name`)
- **Relationship Support**: Works with many-to-one and one-to-many relationships
- **Logical Operators**: Combine with AND, OR, and NOT logic
- **All Query Operators**: Use any operator (eq, like, in, gt, etc.) with relational paths

## Basic Usage

### Single-Level Join

Filter posts by their author's firstname:

```javascript
const posts = await Posts.where({
  'author_id.firstname': 'Alice',
});
```

Generates SQL:

```sql
SELECT * FROM posts
INNER JOIN users ON posts.author_id = users.id
WHERE users.firstname = 'Alice'
```

### Multi-Level Join

Filter posts by their author's organization:

```javascript
const posts = await Posts.where({
  'author_id.organization_id.name': 'ACME Corp',
});
```

Generates SQL:

```sql
SELECT * FROM posts
INNER JOIN users ON posts.author_id = users.id
INNER JOIN organizations ON users.organization_id = organizations.id
WHERE organizations.name = 'ACME Corp'
```

### One-to-Many Reverse Lookup

Filter users by their posts' titles:

```javascript
const users = await Users.where({
  'posts.title': 'My First Post',
});
```

Generates SQL:

```sql
SELECT * FROM users
INNER JOIN posts ON users.id = posts.author_id
WHERE posts.title = 'My First Post'
```

## Advanced Usage

### Combining Relational and Direct Filters

```javascript
const posts = await Posts.where({
  'author_id.organization_id.name': 'ACME Corp',
  'author_id.firstname': 'Alice',
  title: { like: '%Update%' },
  created_at: { gte: '2024-01-01' },
});
```

### Using Query Operators

All standard operators work with relational paths:

```javascript
// LIKE operator
const posts = await Posts.where({
  'author_id.lastname': { like: 'Sm%' },
});

// IN operator
const posts = await Posts.where({
  'author_id.organization_id.country': { in: ['USA', 'UK', 'Canada'] },
});

// Comparison operators
const posts = await Posts.where({
  'author_id.organization_id.id': { gt: 10 },
});
```

### OR Logic with Relational Filters

```javascript
const posts = await Posts.where({
  or: [
    { 'author_id.organization_id.name': 'ACME Corp' },
    { 'author_id.organization_id.name': 'Tech Inc' },
  ],
});
```

### Nested AND/OR Logic

```javascript
const posts = await Posts.where({
  and: [
    { 'author_id.organization_id.name': 'ACME Corp' },
    {
      or: [{ 'author_id.firstname': 'Alice' }, { 'author_id.firstname': 'Charlie' }],
    },
  ],
});
```

Generates SQL:

```sql
SELECT * FROM posts
INNER JOIN users ON posts.author_id = users.id
INNER JOIN organizations ON users.organization_id = organizations.id
WHERE (
  organizations.name = 'ACME Corp'
  AND (users.firstname = 'Alice' OR users.firstname = 'Charlie')
)
```

## Model Relationships

The feature works with these relationship types:

### Many-to-One

```javascript
class Posts {
  static fields = {
    author_id: { type: 'many-to-one', model: 'Users' },
  };
}

// Filter by related model's fields
await Posts.where({ 'author_id.email': 'alice@example.com' });
```

### One-to-Many (Reverse Lookup)

```javascript
class Users {
  static fields = {
    posts: { type: 'one-to-many', foreign: 'Posts.author_id' },
  };
}

// Filter by related collection
await Users.where({ 'posts.title': 'My Post' });
```

## How It Works

1. **Path Resolution**: The system parses dot-notation paths to identify relationships
2. **Join Collection**: All necessary joins are collected from the entire criteria tree
3. **Join Application**: Joins are applied to the query (with deduplication)
4. **Where Clauses**: Finally, WHERE conditions are applied with proper table.column qualification

This two-pass approach ensures:

- Joins are only applied once (no duplicates)
- Joins work correctly with nested OR/AND logic
- Column names are properly qualified to avoid ambiguity

## Important Notes

### Column Name Qualification

When joins are present, all column names in the SELECT clause are automatically qualified with their table names to prevent "ambiguous column name" errors.

### Supported Relationships

Currently supported:

- ✅ Many-to-one (e.g., `post.author_id`)
- ✅ One-to-many (e.g., `user.posts`)

Not yet supported:

- ❌ Many-to-many (coming soon)

### Error Handling

If a relational path cannot be resolved (e.g., field doesn't exist or isn't a relationship), the system treats it as a regular qualified column name and lets Knex handle it:

```javascript
// This will work if you have a table.column syntax
await Posts.where({ 'posts.title': 'My Post' });

// This will throw an error if author_id.nonexistent doesn't exist
await Posts.where({ 'author_id.nonexistent': 'value' });
```

## Examples

See the complete working examples in:

- `demo/relational-filters-demo.js` - Interactive demonstration
- `tests/relational-filters.test.js` - Comprehensive test suite

Run the demo:

```bash
node demo/relational-filters-demo.js
```

## Performance

- **Join Deduplication**: Joins are automatically deduplicated if the same path is used multiple times
- **Efficient SQL**: Generated SQL uses INNER JOINs for optimal query performance
- **Query Planning**: Consider adding indexes on foreign key columns for better performance with large datasets

## Migration from Manual Joins

Before (manual joins):

```javascript
const posts = await repo
  .cnx('posts')
  .join('users', 'posts.author_id', 'users.id')
  .join('organizations', 'users.organization_id', 'organizations.id')
  .where('organizations.name', 'ACME Corp');
```

After (automatic joins):

```javascript
const posts = await Posts.where({
  'author_id.organization_id.name': 'ACME Corp',
});
```

## See Also

- [Query API Documentation](./requests.md)
- [Model Relationships](./models.md)
- [Filtering Criteria](./filtering.md)

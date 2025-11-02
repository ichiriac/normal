/**
 * Demo: Model-level Indexes and Unique Constraints
 *
 * This demo showcases the new indexes feature in NormalJS:
 * - Composite indexes
 * - Unique constraints
 * - Partial indexes
 * - Index types and storage options
 */

const { Connection, Repository } = require('../../index.js');

async function demo() {
  console.log('=== NormalJS Indexes Demo ===\n');

  // Setup
  const conn = new Connection({
    client: 'sqlite3',
    connection: { filename: ':memory:' },
  });
  await conn.connect();
  const repo = new Repository(conn);

  // Example 1: Composite unique constraint
  console.log('1. Composite Unique Constraint:');
  class Accounts {
    static name = 'Accounts';
    static fields = {
      id: 'primary',
      username: { type: 'string', required: true },
      domain: { type: 'string', required: true },
      email: { type: 'string', required: true },
    };
    static indexes = {
      idx_unique_username_domain: {
        fields: ['username', 'domain'],
        unique: true,
      },
    };
  }

  repo.register(Accounts);
  await repo.sync({ force: true });

  // Create accounts
  const acc1 = await repo.get('Accounts').create({
    username: 'john',
    domain: 'example.com',
    email: 'john@example.com',
  });
  console.log(`  ✓ Created account: ${acc1.username}@${acc1.domain}`);

  const acc2 = await repo.get('Accounts').create({
    username: 'john',
    domain: 'other.com',
    email: 'john@other.com',
  });
  console.log(`  ✓ Created account: ${acc2.username}@${acc2.domain}`);
  console.log('  → Same username allowed on different domains\n');

  // Try to create duplicate
  try {
    await repo.get('Accounts').create({
      username: 'john',
      domain: 'example.com',
      email: 'john2@example.com',
    });
  } catch (err) {
    console.log('  ✗ Duplicate username+domain rejected (unique constraint works!)\n');
  }

  // Example 2: Array syntax for simple indexes
  console.log('2. Simple Array Syntax:');
  class Products {
    static name = 'Products';
    static fields = {
      id: 'primary',
      sku: { type: 'string', required: true },
      name: { type: 'string', required: true },
      category: { type: 'string', required: true },
    };
    // Simple array syntax
    static indexes = ['sku', ['category', 'name']];
  }

  repo.register(Products);
  await repo.sync({ force: true });
  console.log('  ✓ Created indexes on: sku, [category, name]\n');

  // Example 3: Partial indexes
  console.log('3. Partial Indexes:');
  class Tasks {
    static name = 'Tasks';
    static fields = {
      id: 'primary',
      title: { type: 'string', required: true },
      completed_at: { type: 'datetime', required: false },
      priority: { type: 'integer', required: true },
    };
    static indexes = {
      idx_active_tasks: {
        fields: ['title'],
        predicate: { completed_at: { isNull: true } },
      },
      idx_high_priority: {
        fields: ['priority'],
        predicate: { priority: { gte: 8 } },
      },
    };
  }

  repo.register(Tasks);
  await repo.sync({ force: true });
  console.log('  ✓ Created partial index on active tasks (completed_at IS NULL)');
  console.log('  ✓ Created partial index on high priority tasks (priority >= 8)\n');

  // Example 4: Field name to column name resolution
  console.log('4. Field Name to Column Name Resolution:');
  class Orders {
    static name = 'Orders';
    static fields = {
      id: 'primary',
      customerEmail: { column: 'customer_email', type: 'string', required: true },
      orderDate: { column: 'order_date', type: 'datetime', required: true },
      orderStatus: { column: 'order_status', type: 'string', required: true },
    };
    static indexes = {
      idx_customer_date: {
        fields: ['customerEmail', 'orderDate'],
      },
    };
  }

  repo.register(Orders);
  await repo.sync({ force: true });

  const model = repo.get('Orders');
  model._init(); // Trigger initialization to see resolved columns
  console.log('  ✓ Field names: ', model.indexes[0].fields);
  console.log('  ✓ Column names:', model.indexes[0].columns);
  console.log('  → Fields are automatically resolved to database columns\n');

  // Example 5: Comparing field-level vs model-level indexes
  console.log('5. Field-level vs Model-level Indexes:');
  class Users {
    static name = 'Users';
    static fields = {
      id: 'primary',
      email: { type: 'string', unique: true, required: true }, // Field-level
      username: { type: 'string', required: true },
      company: { type: 'string', required: true },
    };
    // Model-level for composite
    static indexes = {
      idx_username_company: {
        fields: ['username', 'company'],
        unique: true,
      },
    };
  }

  repo.register(Users);
  await repo.sync({ force: true });
  console.log('  ✓ Field-level unique on: email');
  console.log('  ✓ Model-level composite unique on: [username, company]\n');

  console.log('=== Demo Complete ===');
  console.log('\nKey Takeaways:');
  console.log('• Use model-level indexes for composite constraints');
  console.log('• Partial indexes optimize queries on filtered subsets');
  console.log('• Array syntax provides a shorthand for simple indexes');
  console.log('• Field names are automatically resolved to column names');
  console.log('• Unique constraints prevent duplicate data at the database level');

  await conn.destroy();
}

// Run the demo
demo().catch(console.error);

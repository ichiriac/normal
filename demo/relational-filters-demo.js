/**
 * Demonstration of automatic join generation for relational field filters
 * Run with: node demo/relational-filters-demo.js
 */

const Normal = require('../index');

const conn = new Normal.Connection({
  client: 'sqlite3',
  connection: { filename: ':memory:' },
});

const repo = new Normal.Repository(conn);

// Define models with relationships
class Organizations {
  static name = 'Organizations';
  static fields = {
    id: 'primary',
    name: { type: 'string', required: true },
    country: { type: 'string' },
  };
}

class Users {
  static name = 'Users';
  static fields = {
    id: 'primary',
    firstname: { type: 'string', required: true },
    lastname: { type: 'string', required: true },
    email: { type: 'string', unique: true, required: true },
    organization_id: { type: 'many-to-one', model: 'Organizations' },
    posts: { type: 'one-to-many', foreign: 'Posts.author_id' },
  };
}

class Posts {
  static name = 'Posts';
  static fields = {
    id: 'primary',
    title: { type: 'string', required: true },
    content: { type: 'string', required: true },
    author_id: { type: 'many-to-one', required: true, model: 'Users' },
  };
}

async function demo() {
  console.log('🚀 Relational Field Filters Demo\n');

  // Register models
  repo.register(Organizations);
  repo.register(Users);
  repo.register(Posts);

  await repo.sync({ force: true });

  const Orgs = repo.get('Organizations');
  const UsersModel = repo.get('Users');
  const PostsModel = repo.get('Posts');

  // Create test data
  console.log('📝 Creating test data...');
  const acme = await Orgs.create({ name: 'ACME Corp', country: 'USA' });
  const techCo = await Orgs.create({ name: 'Tech Co', country: 'UK' });

  const alice = await UsersModel.create({
    firstname: 'Alice',
    lastname: 'Smith',
    email: 'alice@acme.com',
    organization_id: acme.id,
  });

  const bob = await UsersModel.create({
    firstname: 'Bob',
    lastname: 'Johnson',
    email: 'bob@tech.com',
    organization_id: techCo.id,
  });

  const charlie = await UsersModel.create({
    firstname: 'Charlie',
    lastname: 'Brown',
    email: 'charlie@acme.com',
    organization_id: acme.id,
  });

  await PostsModel.create({
    title: 'Getting Started with ACME',
    content: 'An introduction to our services...',
    author_id: alice.id,
  });

  await PostsModel.create({
    title: 'Tech Innovations',
    content: 'Latest developments in technology...',
    author_id: bob.id,
  });

  await PostsModel.create({
    title: 'ACME Product Update',
    content: 'New features released...',
    author_id: charlie.id,
  });

  console.log('✅ Test data created\n');

  // Example 1: Single-level join
  console.log('📌 Example 1: Filter posts by author firstname (single join)');
  const query1 = PostsModel.where({ 'author_id.firstname': 'Alice' });
  console.log('SQL:', query1.toString());
  const results1 = await query1;
  console.log(`Found ${results1.length} post(s):`);
  results1.forEach((p) => console.log(`  - ${p.title}`));
  console.log();

  // Example 2: Multi-level join
  console.log('📌 Example 2: Filter posts by author organization (multi-level join)');
  const query2 = PostsModel.where({ 'author_id.organization_id.name': 'ACME Corp' });
  console.log('SQL:', query2.toString());
  const results2 = await query2;
  console.log(`Found ${results2.length} post(s):`);
  results2.forEach((p) => console.log(`  - ${p.title}`));
  console.log();

  // Example 3: Combined filters
  console.log('📌 Example 3: Combined relational and direct filters');
  const query3 = PostsModel.where({
    'author_id.organization_id.name': 'ACME Corp',
    title: { like: '%Update%' },
  });
  console.log('SQL:', query3.toString());
  const results3 = await query3;
  console.log(`Found ${results3.length} post(s):`);
  results3.forEach((p) => console.log(`  - ${p.title}`));
  console.log();

  // Example 4: OR logic with relational filters
  console.log('📌 Example 4: OR logic with relational filters');
  const query4 = PostsModel.where({
    or: [
      { 'author_id.organization_id.country': 'USA' },
      { 'author_id.organization_id.country': 'UK' },
    ],
  });
  console.log('SQL:', query4.toString());
  const results4 = await query4;
  console.log(`Found ${results4.length} post(s):`);
  results4.forEach((p) => console.log(`  - ${p.title}`));
  console.log();

  // Example 5: Nested AND/OR logic
  console.log('📌 Example 5: Nested AND/OR logic with relational filters');
  const query5 = PostsModel.where({
    and: [
      { 'author_id.organization_id.name': 'ACME Corp' },
      { or: [{ 'author_id.firstname': 'Alice' }, { 'author_id.firstname': 'Charlie' }] },
    ],
  });
  console.log('SQL:', query5.toString());
  const results5 = await query5;
  console.log(`Found ${results5.length} post(s):`);
  results5.forEach((p) => console.log(`  - ${p.title}`));
  console.log();

  // Example 6: One-to-many reverse lookup
  console.log('📌 Example 6: Filter users by their posts (one-to-many reverse)');
  const query6 = UsersModel.where({ 'posts.title': { like: '%ACME%' } });
  console.log('SQL:', query6.toString());
  const results6 = await query6;
  console.log(`Found ${results6.length} user(s):`);
  for (const user of results6) {
    console.log(`  - ${user.firstname} ${user.lastname}`);
  }
  console.log();

  console.log('✨ Demo complete!');
  await conn.destroy();
}

demo().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});

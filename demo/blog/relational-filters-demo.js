/**
 * Demonstration of automatic join generation for relational field filters
 *
 * This demo showcases how NormalJS automatically generates SQL joins when filtering
 * by relational field names using dot-notation (e.g., 'author_id.firstname').
 *
 * Documentation: https://ichiriac.github.io/normal/relational-filters
 *
 * Run with: node demo/blog/relational-filters-demo.js
 */

const Normal = require('../../index');
const models = require('./models');

const conn = new Normal.Connection({
  client: 'sqlite3',
  connection: { filename: ':memory:' },
});

const repo = new Normal.Repository(conn);

async function demo() {
  console.log('🚀 Relational Field Filters Demo');
  console.log('📚 Documentation: https://ichiriac.github.io/normal/relational-filters\n');

  // Register blog models
  repo.register(models);
  await repo.sync({ force: true });

  const Users = repo.get('Users');
  const Posts = repo.get('Posts');
  const Comments = repo.get('Comments');

  // Create test data
  console.log('📝 Creating test data...');

  const alice = await Users.create({
    firstname: 'Alice',
    lastname: 'Smith',
    email: 'alice@example.com',
    password_hash: 'hash123',
  });

  const bob = await Users.create({
    firstname: 'Bob',
    lastname: 'Johnson',
    email: 'bob@example.com',
    password_hash: 'hash456',
  });

  const charlie = await Users.create({
    firstname: 'Charlie',
    lastname: 'Brown',
    email: 'charlie@example.com',
    password_hash: 'hash789',
  });

  const post1 = await Posts.create({
    title: 'Getting Started with NormalJS',
    content: 'An introduction to the ORM...',
    author_id: alice.id,
  });

  const post2 = await Posts.create({
    title: 'Advanced Query Techniques',
    content: 'Learn about complex queries...',
    author_id: bob.id,
  });

  const post3 = await Posts.create({
    title: 'Building a Blog with NormalJS',
    content: 'Step-by-step tutorial...',
    author_id: charlie.id,
  });

  await Comments.create({
    content: 'Great post!',
    post_id: post1.id,
    author_id: bob.id,
  });

  await Comments.create({
    content: 'Thanks for sharing!',
    post_id: post1.id,
    author_id: charlie.id,
  });

  await Comments.create({
    content: 'Very informative!',
    post_id: post2.id,
    author_id: alice.id,
  });

  console.log('✅ Test data created\n');

  // Example 1: Single-level join
  console.log('📌 Example 1: Filter posts by author firstname (single join)');
  const query1 = Posts.where({ 'author_id.firstname': 'Alice' });
  console.log('SQL:', query1.toString());
  const results1 = await query1;
  console.log(`Found ${results1.length} post(s):`);
  results1.forEach((p) => console.log(`  - ${p.title}`));
  console.log();

  // Example 2: Filter posts by author lastname
  console.log('📌 Example 2: Filter posts by author lastname');
  const query2 = Posts.where({ 'author_id.lastname': 'Johnson' });
  console.log('SQL:', query2.toString());
  const results2 = await query2;
  console.log(`Found ${results2.length} post(s):`);
  results2.forEach((p) => console.log(`  - ${p.title}`));
  console.log();

  // Example 3: Combined relational and direct filters
  console.log('📌 Example 3: Combined relational and direct filters');
  const query3 = Posts.where({
    'author_id.firstname': 'Alice',
    title: { like: '%NormalJS%' },
  });
  console.log('SQL:', query3.toString());
  const results3 = await query3;
  console.log(`Found ${results3.length} post(s):`);
  results3.forEach((p) => console.log(`  - ${p.title}`));
  console.log();

  // Example 4: OR logic with relational filters
  console.log('📌 Example 4: OR logic with relational filters');
  const query4 = Posts.where({
    or: [{ 'author_id.firstname': 'Alice' }, { 'author_id.firstname': 'Bob' }],
  });
  console.log('SQL:', query4.toString());
  const results4 = await query4;
  console.log(`Found ${results4.length} post(s):`);
  results4.forEach((p) => console.log(`  - ${p.title}`));
  console.log();

  // Example 5: One-to-many reverse lookup
  console.log('📌 Example 5: Filter users by their posts (one-to-many reverse)');
  const query5 = Users.where({ 'posts.title': { like: '%NormalJS%' } });
  console.log('SQL:', query5.toString());
  const results5 = await query5;
  console.log(`Found ${results5.length} user(s):`);
  for (const user of results5) {
    console.log(`  - ${user.firstname} ${user.lastname}`);
  }
  console.log();

  // Example 6: Filter comments by post author
  console.log('📌 Example 6: Filter comments by post author (chained joins)');
  const query6 = Comments.where({ 'post_id.author_id.firstname': 'Alice' });
  console.log('SQL:', query6.toString());
  const results6 = await query6;
  console.log(`Found ${results6.length} comment(s):`);
  results6.forEach((c) => console.log(`  - "${c.content}"`));
  console.log();

  // Example 7: Complex nested logic
  console.log('📌 Example 7: Complex nested AND/OR logic');
  const query7 = Posts.where({
    and: [
      { 'author_id.firstname': { in: ['Alice', 'Charlie'] } },
      { title: { like: '%NormalJS%' } },
    ],
  });
  console.log('SQL:', query7.toString());
  const results7 = await query7;
  console.log(`Found ${results7.length} post(s):`);
  results7.forEach((p) => console.log(`  - ${p.title}`));
  console.log();

  console.log('✨ Demo complete!');
  console.log('📚 Learn more: https://ichiriac.github.io/normal/relational-filters');

  await conn.destroy();
}

demo().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});

import * as Normal from '../../..';
import models from './models';

type UsersModel = any; // placeholder for stricter typing later
type PostsModel = any;
type CommentsModel = any;

const conn = new (Normal as any).Connection({
  client: 'sqlite3',
  connection: { filename: ':memory:' },
});
const repo = new (Normal as any).Repository(conn);

async function demo() {
  console.log('🚀 Relational Field Filters Demo (TS)');

  repo.register(models as any);
  await repo.sync({ force: true });

  const Users: UsersModel = repo.get('Users');
  const Posts: PostsModel = repo.get('Posts');
  const Comments: CommentsModel = repo.get('Comments');

  const alice = await Users.create({ firstname: 'Alice', lastname: 'Smith', email: 'alice@example.com', password_hash: 'hash123' });
  const bob = await Users.create({ firstname: 'Bob', lastname: 'Johnson', email: 'bob@example.com', password_hash: 'hash456' });
  const charlie = await Users.create({ firstname: 'Charlie', lastname: 'Brown', email: 'charlie@example.com', password_hash: 'hash789' });

  const post1 = await Posts.create({ title: 'Getting Started with NormalJS', content: 'An introduction to the ORM...', author_id: alice.id });
  const post2 = await Posts.create({ title: 'Advanced Query Techniques', content: 'Learn about complex queries...', author_id: bob.id });
  await Comments.create({ content: 'Great post!', post_id: post1.id, author_id: bob.id });
  await Comments.create({ content: 'Thanks for sharing!', post_id: post1.id, author_id: charlie.id });
  await Comments.create({ content: 'Very informative!', post_id: post2.id, author_id: alice.id });

  const q1 = Posts.where({ 'author_id.firstname': 'Alice' });
  console.log('SQL1:', (q1 as any).toString());
  const r1 = await q1;
  console.log('Found', r1.length, 'post(s)');

  const q5 = Users.where({ 'posts.title': { like: '%NormalJS%' } });
  console.log('SQL5:', (q5 as any).toString());
  const r5 = await q5;
  console.log('Found', r5.length, 'user(s)');

  await conn.destroy();
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
 demo().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});

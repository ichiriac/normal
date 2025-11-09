// @ts-nocheck - Test file with implicit any types
import { Connection, Repository  } from '..';
import * as models from '../demo/blog/models';
import { buildJoinChain, selectRootIdsByLeafRecord  } from '../src/utils/dependency';

describe('utils/dependency join chain and selection', () => {
  let conn;
  let repo;

  beforeAll(async () => {
    conn = new Connection({ client: 'sqlite3', connection: { filename: ':memory:' } });
    await conn.connect();
    repo = new Repository(conn);
    repo.register(models.Users);
    repo.register(models.Posts);
    repo.register(models.Tags);
    repo.register(models.Comments);
    await repo.sync({ force: true });
  });

  afterAll(async () => {
    await conn.destroy();
  });

  test('buildJoinChain builds correct LEFT JOINs for many-to-one hops', async () => {
  const Comments = repo.get('Comments');
  // Ensure fields are attached and initialized for all involved models
  Comments._init();
  repo.get('Posts')._init();
  repo.get('Users')._init();
    const chain = buildJoinChain(Comments, 'post_id.author_id.id');

    expect(chain.joins).toHaveLength(2);
    // First hop: Comments.post_id -> Posts.id
    expect(chain.joins[0]).toMatchObject({
      table: repo.get('Posts').table,
      left: 't0.post_id',
      right: 't1.id',
      alias: 't1',
    });
    // Second hop: Posts.author_id -> Users.id
    expect(chain.joins[1]).toMatchObject({
      table: repo.get('Users').table,
      left: 't1.author_id',
      right: 't2.id',
      alias: 't2',
    });
    expect(chain.leafModel.name).toBe('Users');
    expect(chain.leafField).toBe('id');
  });

  test('selectRootIdsByLeafRecord returns root records linked through path', async () => {
    const Users = repo.get('Users');
    const Posts = repo.get('Posts');
    const Comments = repo.get('Comments');

    const alice = await Users.create({
      firstname: 'Alice',
      lastname: 'Doe',
      email: 'alice@example.com',
      password_hash: 'x',
    });
    const bob = await Users.create({
      firstname: 'Bob',
      lastname: 'Doe',
      email: 'bob@example.com',
      password_hash: 'x',
    });

    const p1 = await Posts.create({ title: 'P1', content: 'c', author_id: alice.id });
    const p2 = await Posts.create({ title: 'P2', content: 'c', author_id: bob.id });

    const c1 = await Comments.create({ content: 'c1', post_id: p1.id, author_id: alice.id });
    await Comments.create({ content: 'c2', post_id: p2.id, author_id: bob.id });

    const affected = await selectRootIdsByLeafRecord(Comments, 'post_id.author_id.id', alice);
    const ids = affected.map((r) => r.id).sort();
    expect(ids).toContain(c1.id);
    // Ensure no comments from Bob's authored posts are returned for Alice
    const notAlice = affected.filter((r) => r.post_id && r.post_id.id === p2.id);
    expect(notAlice.length).toBe(0);
  });
});

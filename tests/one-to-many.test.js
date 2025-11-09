const { Connection, Repository } = require('..');
const demo = require('../demo/blog/models');

describe('fields/OneToMany', () => {
  let conn;
  let repo;

  beforeAll(async () => {
    conn = new Connection({ client: 'sqlite3', connection: { filename: ':memory:' } });
    await conn.connect();
    repo = new Repository(conn);
    repo.register(demo.Users);
    repo.register(demo.Posts);
    repo.register(demo.Tags);
    repo.register(demo.Comments);
    await repo.sync({ force: true });
  });

  afterAll(async () => {
    await conn.destroy();
  });

  test('throws when missing foreign in definition', async () => {
    class BadModel {
      static _name = 'BadModel';
      static table = 'bad';
      static fields = {
        id: 'primary',
        // Missing foreign -> should throw
        children: { type: 'one-to-many' },
      };
    }
    const r = new Repository(conn);
    r.register(BadModel);
    // Initialization happens during sync; expect it to fail during field construction
    await expect(r.sync({ force: true })).rejects.toThrow(/requires a "foreign" definition/);
  });

  test('read() loads related children and caches result', async () => {
    const Users = repo.get('Users');
    const Posts = repo.get('Posts');

    const user = await Users.create({
      firstname: 'John',
      lastname: 'Smith',
      email: 'john@example.com',
      password_hash: 'x',
    });

    const p1 = await Posts.create({ title: 'Hello', content: 'c', author_id: user.id });
    const p2 = await Posts.create({ title: 'World', content: 'c', author_id: user.id });

    const list = await user.posts;
    expect(Array.isArray(list)).toBe(true);
    const titles = list.map((p) => p.title).sort();
    expect(titles).toEqual(['Hello', 'World']);

    // Second read should resolve immediately from cached data
    const list2 = await user.posts;
    expect(list2.length).toBe(2);
    expect(list2[0].id).toBeDefined();
    // Avoid unused vars
    expect(p1.id).toBeGreaterThan(0);
    expect(p2.id).toBeGreaterThan(0);
  });

  test('post_create creates related records provided via write()', async () => {
    const Users = repo.get('Users');
    const Posts = repo.get('Posts');

    const jane = await Users.create({
      firstname: 'Jane',
      lastname: 'Roe',
      email: 'jane@example.com',
      password_hash: 'x',
      // Pre-supply related posts through the one-to-many field
      posts: [
        { title: 'T1', content: 'A' },
        { title: 'T2', content: 'B' },
      ],
    });

    const authored = await Posts.where({ author_id: jane.id });
    expect(authored.length).toBe(2);
    const ts = authored.map((p) => p.title).sort();
    expect(ts).toEqual(['T1', 'T2']);
  });
});

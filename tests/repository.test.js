const { Connection, Repository } = require('..');
const models = require('../demo/blog/models');

/**
 * Integration-like test using sqlite3 in-memory to avoid external DB.
 */
describe('Repository + sqlite3', () => {
  let conn;
  let repo;

  beforeAll(async () => {
    conn = new Connection({ client: 'sqlite3', connection: { filename: ':memory:' } });
    await conn.connect();
    repo = new Repository(conn);
    // Register demo models
    repo.register(models.Users);
    repo.register(models.Posts);
    repo.register(models.Tags);
    repo.register(models.Comments);
    await repo.sync({ force: true });
  });

  afterAll(async () => {
    await conn.destroy();
  });

  test('can create and fetch a user', async () => {
    const Users = repo.get('Users');
    const u = await Users.create({
      firstname: 'Ada',
      lastname: 'Lovelace',
      email: 'ada@example.com',
      password_hash: 'x',
    });
    expect(u.id).toBeGreaterThan(0);
    expect(u.name).toBe('Ada Lovelace');

    const found = await Users.findById(u.id);
    expect(found).not.toBeNull();
    expect(found.email).toBe('ada@example.com');
  });

  test('posts and many-to-many tags', async () => {
    const Users = repo.get('Users');
    const Posts = repo.get('Posts');
    const Tags = repo.get('Tags');

    const author = await Users.create({
      firstname: 'Tim',
      lastname: 'Berners-Lee',
      email: 'tim@example.com',
      password_hash: 'x',
    });

    const p = await Posts.create({
      title: 'Hello Web',
      content: 'The web is for everyone',
      author_id: author.id,
    });

    const t1 = await Tags.create({ name: 'web' });
    const t2 = await Tags.create({ name: 'history' });

    // Add tags via relation proxy
    await p.tags.add(t1);
    await p.tags.add(t2.id);

    const loaded = await p.tags.load();
    const tagNames = loaded.map((t) => t.name).sort();
    expect(tagNames).toEqual(['history', 'web']);
  });

  test('comments relation via foreign keys', async () => {
    const Users = repo.get('Users');
    const Posts = repo.get('Posts');
    const Comments = repo.get('Comments');

    const user = await Users.create({
      firstname: 'Grace',
      lastname: 'Hopper',
      email: 'grace@example.com',
      password_hash: 'x',
    });

    const post = await Posts.create({
      title: 'COBOL Thoughts',
      content: 'Some content',
      author_id: user.id,
    });

    const c = await Comments.create({
      content: 'Nice read',
      post_id: post.id,
      author_id: user.id,
    });

    expect(c.id).toBeGreaterThan(0);
    const got = await Comments.findById(c.id);
    expect(got.content).toBe('Nice read');
  });
});

const { Connection, Repository } = require('..');

/**
 * Test automatic join generation for relational field filters.
 */
describe('Relational Filters with Auto-Join', () => {
  let conn;
  let repo;
  let Users, Posts, Comments, Organizations;

  beforeAll(async () => {
    conn = new Connection({ client: 'sqlite3', connection: { filename: ':memory:' } });
    await conn.connect();
    repo = new Repository(conn);

    // Define test models with relationships
    class OrganizationsModel {
      static name = 'Organizations';
      static table = 'organizations';
      static fields = {
        id: 'primary',
        name: { type: 'string', required: true },
        country: { type: 'string' },
      };
    }

    class UsersModel {
      static name = 'Users';
      static table = 'users';
      static fields = {
        id: 'primary',
        firstname: 'string',
        lastname: { type: 'string', required: true },
        email: { type: 'string', unique: true, required: true },
        organization_id: { type: 'many-to-one', model: 'Organizations' },
        posts: { type: 'one-to-many', foreign: 'Posts.author_id' },
        comments: { type: 'one-to-many', foreign: 'Comments.author_id' },
      };
    }

    class PostsModel {
      static name = 'Posts';
      static table = 'posts';
      static fields = {
        id: 'primary',
        title: { type: 'string', required: true },
        content: { type: 'string', required: true },
        author_id: { type: 'many-to-one', required: true, model: 'Users' },
        comments: { type: 'one-to-many', foreign: 'Comments.post_id' },
        tags: { type: 'many-to-many', model: 'Tags' },
      };
    }

    class CommentsModel {
      static name = 'Comments';
      static table = 'comments';
      static fields = {
        id: 'primary',
        content: { type: 'string', required: true },
        post_id: { type: 'many-to-one', required: true, model: 'Posts' },
        author_id: { type: 'many-to-one', required: true, model: 'Users' },
      };
    }

    class TagsModel {
      static name = 'Tags';
      static table = 'tags';
      static fields = {
        id: 'primary',
        name: { type: 'string', unique: true, required: true },
      };
    }

    // Register models
    repo.register(OrganizationsModel);
    repo.register(UsersModel);
    repo.register(PostsModel);
    repo.register(CommentsModel);
    repo.register(TagsModel);

    await repo.sync({ force: true });

    // Store references
    Users = repo.get('Users');
    Posts = repo.get('Posts');
    Comments = repo.get('Comments');
    Organizations = repo.get('Organizations');

    // Create test data
    const acme = await Organizations.create({ name: 'ACME Corp', country: 'USA' });
    const techInc = await Organizations.create({ name: 'Tech Inc', country: 'UK' });

    const alice = await Users.create({
      firstname: 'Alice',
      lastname: 'Smith',
      email: 'alice@acme.com',
      organization_id: acme.id,
    });

    const bob = await Users.create({
      firstname: 'Bob',
      lastname: 'Johnson',
      email: 'bob@tech.com',
      organization_id: techInc.id,
    });

    const charlie = await Users.create({
      firstname: 'Charlie',
      lastname: 'Brown',
      email: 'charlie@acme.com',
      organization_id: acme.id,
    });

    const post1 = await Posts.create({
      title: 'ACME Post 1',
      content: 'Content by Alice',
      author_id: alice.id,
    });

    const post2 = await Posts.create({
      title: 'Tech Post',
      content: 'Content by Bob',
      author_id: bob.id,
    });

    await Posts.create({
      title: 'ACME Post 2',
      content: 'Content by Charlie',
      author_id: charlie.id,
    });

    await Comments.create({
      content: 'Great post!',
      post_id: post1.id,
      author_id: bob.id,
    });

    await Comments.create({
      content: 'Nice work',
      post_id: post2.id,
      author_id: alice.id,
    });
  });

  afterAll(async () => {
    await conn.destroy();
  });

  test('filter posts by author firstname (single join)', async () => {
    const results = await Posts.where({ 'author_id.firstname': 'Alice' });
    expect(results.length).toBe(1);
    expect(results[0].title).toBe('ACME Post 1');
  });

  test('filter posts by author lastname (single join)', async () => {
    const results = await Posts.where({ 'author_id.lastname': 'Johnson' });
    expect(results.length).toBe(1);
    expect(results[0].title).toBe('Tech Post');
  });

  test('filter posts by author organization name (chained joins)', async () => {
    const results = await Posts.where({ 'author_id.organization_id.name': 'ACME Corp' });
    expect(results.length).toBe(2);
    const titles = results.map((p) => p.title).sort();
    expect(titles).toEqual(['ACME Post 1', 'ACME Post 2']);
  });

  test('filter posts by author organization country (chained joins)', async () => {
    const results = await Posts.where({ 'author_id.organization_id.country': 'UK' });
    expect(results.length).toBe(1);
    expect(results[0].title).toBe('Tech Post');
  });

  test('filter comments by post author organization (deep chain)', async () => {
    const results = await Comments.where({ 'post_id.author_id.organization_id.name': 'ACME Corp' });
    expect(results.length).toBe(1);
    expect(results[0].content).toBe('Great post!');
  });

  test('filter comments by author organization (single level through author)', async () => {
    const results = await Comments.where({ 'author_id.organization_id.name': 'Tech Inc' });
    expect(results.length).toBe(1);
    expect(results[0].content).toBe('Great post!');
  });

  test('combine relational filter with direct field filter', async () => {
    const results = await Posts.where({
      'author_id.organization_id.name': 'ACME Corp',
      title: 'ACME Post 1',
    });
    expect(results.length).toBe(1);
    expect(results[0].title).toBe('ACME Post 1');
  });

  test('use operators with relational filters', async () => {
    const results = await Posts.where({
      'author_id.organization_id.name': { like: '%Corp%' },
    });
    expect(results.length).toBe(2);
  });

  test('filter with OR logic on relational fields', async () => {
    const results = await Posts.where({
      or: [
        { 'author_id.organization_id.name': 'ACME Corp' },
        { 'author_id.organization_id.name': 'Tech Inc' },
      ],
    });
    expect(results.length).toBe(3);
  });

  test('filter with nested AND/OR logic on relational fields', async () => {
    const results = await Posts.where({
      and: [
        { 'author_id.organization_id.name': 'ACME Corp' },
        { or: [{ 'author_id.firstname': 'Alice' }, { 'author_id.firstname': 'Charlie' }] },
      ],
    });
    expect(results.length).toBe(2);
  });

  test('direct field filter still works without joins', async () => {
    const results = await Posts.where({ title: 'Tech Post' });
    expect(results.length).toBe(1);
    expect(results[0].title).toBe('Tech Post');
  });

  test('qualified column names still work', async () => {
    const results = await Posts.where({ 'posts.title': 'ACME Post 1' });
    expect(results.length).toBe(1);
  });

  test('invalid relational path throws error', async () => {
    await expect(Posts.where({ 'author_id.nonexistent': 'value' })).rejects.toThrow();
  });

  test('non-relational field with dots is treated as qualified column', async () => {
    // This should not throw and just use the column as-is
    const results = await Posts.where({ 'posts.title': 'Tech Post' });
    expect(results.length).toBe(1);
  });

  test('multiple relational filters with same base path reuse joins', async () => {
    const results = await Posts.where({
      'author_id.firstname': 'Alice',
      'author_id.lastname': 'Smith',
    });
    expect(results.length).toBe(1);
    expect(results[0].title).toBe('ACME Post 1');
  });

  test('filter users by posts relation (one-to-many reverse lookup)', async () => {
    const results = await Users.where({ 'posts.title': 'ACME Post 1' });
    expect(results.length).toBeGreaterThanOrEqual(1);
    const alice = results.find((u) => u.firstname === 'Alice');
    expect(alice).toBeDefined();
    expect(alice.email).toBe('alice@acme.com');
  });

  test('one-to-many join returns distinct parent rows (no duplicates)', async () => {
    // This test verifies that when joining with one-to-many relationships,
    // we don't get duplicate parent rows when multiple children match the filter.
    // For example: if a post has 3 comments containing "great", we should get
    // 1 post row, not 3 duplicate post rows.

    // Create a post with multiple comments containing the same keyword
    const testUser = await Users.create({
      firstname: 'Test',
      lastname: 'User',
      email: 'test@test.com',
      organization_id: null,
    });

    const testPost = await Posts.create({
      title: 'Test Post with Comments',
      content: 'Content',
      author_id: testUser.id,
    });

    // Create 3 comments with the same keyword
    await Comments.create({
      content: 'This is great!',
      post_id: testPost.id,
      author_id: testUser.id,
    });

    await Comments.create({
      content: 'Really great work!',
      post_id: testPost.id,
      author_id: testUser.id,
    });

    await Comments.create({
      content: 'Great tutorial!',
      post_id: testPost.id,
      author_id: testUser.id,
    });

    // Query posts that have comments containing "great"
    const results = await Posts.where({ 'comments.content': { like: '%great%' } });

    // Find our test post in the results
    const foundPosts = results.filter((p) => p.id === testPost.id);

    // The post should appear only ONCE, even though it has 3 matching comments
    // This is the expected behavior - we want distinct parent records
    expect(foundPosts.length).toBe(1);
  });
});

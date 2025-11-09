// @ts-nocheck - Test file with implicit any types

import { Connection, Repository } from '..';

/**
 * Additional operator coverage for criteria.applyCriteria
 */
describe('Criteria operators and logic (additional)', () => {
  let conn;
  let repo;
  let Users, Posts;

  beforeAll(async () => {
    conn = new Connection({ client: 'sqlite3', connection: { filename: ':memory:' } });
    await conn.connect();
    repo = new Repository(conn);

    class UsersModel {
      static _name = 'Users';
      static table = 'users';
      static fields = {
        id: 'primary',
        name: 'string',
        email: 'string',
        organization_id: { type: 'many-to-one', model: 'Organizations' },
      };
    }

    class PostsModel {
      static _name = 'Posts';
      static table = 'posts';
      static fields = {
        id: 'primary',
        title: 'string',
        content: 'string',
        author_id: { type: 'many-to-one', model: 'Users' },
      };
    }

    class OrganizationsModel {
      static _name = 'Organizations';
      static table = 'organizations';
      static fields = { id: 'primary', name: 'string' };
    }

    repo.register(OrganizationsModel);
    repo.register(UsersModel);
    repo.register(PostsModel);
    await repo.sync({ force: true });

    Users = repo.get('Users');
    Posts = repo.get('Posts');

    const org = await repo.get('Organizations').create({ name: 'Acme' });
    const alice = await Users.create({
      name: 'Alice',
      email: 'alice@Acme.com',
      organization_id: org.id,
    });
    const bob = await Users.create({ name: 'Bob', email: 'bob@other.com', organization_id: null });

    await Posts.create({ title: 'Hello', content: 'A', author_id: alice.id });
    await Posts.create({ title: 'World', content: 'B', author_id: alice.id });
    await Posts.create({ title: 'Other', content: 'C', author_id: bob.id });
  });

  afterAll(async () => {
    await conn.destroy();
  });

  test('not operator wraps inner criteria', async () => {
    const results = await Posts.where({ not: { title: 'Hello' } });
    const titles = results.map((p) => p.title).sort();
    expect(titles).toEqual(['Other', 'World']);
  });

  test('null and notNull toggles', async () => {
    const hasOrg = await Users.where({ organization_id: { notNull: true } });
    const noOrg = await Users.where({ organization_id: { null: true } });
    expect(hasOrg.length).toBe(1);
    expect(noOrg.length).toBe(1);
    expect(hasOrg[0].name).toBe('Alice');
    expect(noOrg[0].name).toBe('Bob');
  });

  test('between and nbetween on id ranges', async () => {
    const all = await Posts.query().select('id').orderBy('id');
    const min = all[0].id;
    const max = all[all.length - 1].id;

    const inRange = await Posts.where({ id: { between: [min, max - 1] } });
    const outRange = await Posts.where({ id: { nbetween: [min, max - 1] } });
    expect(inRange.length + outRange.length).toBe(3);
  });

  test('in and nin operators', async () => {
    const ids = (await Posts.query().select('id')).map((r) => r.id);
    const some = await Posts.where({ id: { in: [ids[0], ids[2]] } });
    const others = await Posts.where({ id: { nin: [ids[0], ids[2]] } });
    expect(some.length + others.length).toBe(3);
    expect(some.find((p) => p.id === ids[1])).toBeUndefined();
  });

  test('ilike fallback on sqlite (case-insensitive)', async () => {
    const users = await Users.where({ email: { ilike: '%acme.com' } });
    expect(users.length).toBe(1);
    expect(users[0].name).toBe('Alice');
  });

  test('unknown operator ignored', async () => {
    const results = await Posts.where({ title: { unknown: 'x' } });
    // Should not filter anything due to unknown op
    expect(results.length).toBe(3);
  });
});

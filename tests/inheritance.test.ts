// @ts-nocheck - Test file with implicit any types

import { Connection, Repository } from '..';
import * as Contact from '../demo/crm/models/Contact';
import * as User from '../demo/crm/models/User';
import * as ActivityMixin from '../demo/crm/models/ActivityMixin';
import * as MessageMixin from '../demo/crm/models/MessageMixin';

/**
 * Inheritance integration tests using CRM demo models.
 */

describe('Model inheritance (Contact <- User)', () => {
  let conn;
  let repo;

  beforeAll(async () => {
    conn = new Connection({ client: 'sqlite3', connection: { filename: ':memory:' } });
    await conn.connect();
    repo = new Repository(conn);
    // Register mixins before base models
    repo.register(ActivityMixin);
    repo.register(MessageMixin);
    repo.register(Contact);
    repo.register(User);
    await repo.sync({ force: true });
  });

  afterAll(async () => {
    await conn.destroy();
  });

  test('create user stores parent(Contact) and child(User) parts; reading user exposes contact fields', async () => {
    const Users = repo.get('User');
    const Contacts = repo.get('Contact');

    const u = await Users.create({
      email: 'u@example.com',
      password_hash: 'pw',
      first_name: 'Jane',
      last_name: 'Doe',
    });

    expect(u.id).toBeGreaterThan(0);
    // Access contact fields directly through user
    expect(u.first_name).toBe('Jane');
    expect(u.last_name).toBe('Doe');

    // JSON serialization includes inherited contact fields
    const json = u.toJSON();
    expect(json).toMatchObject({
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'u@example.com',
      password_hash: 'pw',
    });

    // Ensure rows exist in both tables with same id
    const contactRow = await conn.instance(Contacts.table).where({ id: u.id }).first();
    const userRow = await conn.instance(Users.table).where({ id: u.id }).first();
    expect(contactRow).toBeTruthy();
    expect(userRow).toBeTruthy();
  });

  test('updating contact fields via user writes to Contact table', async () => {
    const Users = repo.get('User');
    const Contacts = repo.get('Contact');

    const u = await Users.firstWhere({ 'users.email': 'u@example.com' });
    expect(u).toBeTruthy();
    u.first_name = 'Janet';
    await u.flush();

    const contactRow = await conn.instance(Contacts.table).where({ id: u.id }).first();
    expect(contactRow.first_name).toBe('Janet');
  });

  test('fetching a user includes parent(contact) fields due to auto-join', async () => {
    const Users = repo.get('User');
    // Ensure select without manual joins returns both parent+child fields hydrated
    const got = await Users.findById(
      (await Users.firstWhere({ 'users.email': 'u@example.com' })).id
    );
    expect(got.first_name).toBe('Janet');
    const json = got.toJSON();
    expect(json.first_name).toBe('Janet');
  });

  test('loading Contact row with class discriminator returns User instance', async () => {
    const Contacts = repo.get('Contact');
    const Users = repo.get('User');

    const anyUser = await Users.firstWhere({ 'users.email': 'u@example.com' });
    // Load from Contact model by id
    const asContact = await Contacts.findById(anyUser.id);
    // Should be allocated as User due to discriminator
    expect(asContact._model.name).toBe('User');
    expect(asContact.first_name).toBe('Janet');
  });
});

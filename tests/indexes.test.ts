// @ts-nocheck - Test file with implicit any types


import { Connection, Repository  } from '..';

describe('Model-level indexes', () => {
  let conn;
  let repo;

  beforeAll(async () => {
    conn = new Connection({ client: 'sqlite3', connection: { filename: ':memory:' } });
    await conn.connect();
  });

  afterAll(async () => {
    await conn.destroy();
  });

  beforeEach(async () => {
    repo = new Repository(conn);
  });

  describe('Simple composite index', () => {
    test('should create composite index on multiple fields', async () => {
      class Users {
        static name = 'Users';
        static fields = {
          id: 'primary',
          email: { type: 'string', required: true },
          company: { type: 'string', required: true },
          status: { type: 'string', required: true },
        };
        static indexes = {
          idx_lookup: {
            fields: ['email', 'company'],
          },
        };
      }

      repo.register(Users);
      await repo.sync({ force: true });

      const model = repo.get('Users');
      model._init(); // Trigger initialization to validate indexes
      expect(model.indexes).toHaveLength(1);
      expect(model.indexes[0].name).toBe('idx_lookup');
      expect(model.indexes[0].fields).toEqual(['email', 'company']);
      expect(model.indexes[0].columns).toEqual(['email', 'company']);
    });

    test('should create multiple indexes', async () => {
      class Products {
        static name = 'Products';
        static fields = {
          id: 'primary',
          sku: { type: 'string', required: true },
          name: { type: 'string', required: true },
          category: { type: 'string', required: true },
          price: { type: 'float', required: true },
        };
        static indexes = {
          idx_sku: {
            fields: ['sku'],
          },
          idx_category_price: {
            fields: ['category', 'price'],
          },
        };
      }

      repo.register(Products);
      await repo.sync({ force: true });

      const model = repo.get('Products');
      expect(model.indexes).toHaveLength(2);
      expect(model.indexes[0].name).toBe('idx_sku');
      expect(model.indexes[1].name).toBe('idx_category_price');
    });
  });

  describe('Unique constraints', () => {
    test('should create unique composite index', async () => {
      class Accounts {
        static name = 'Accounts';
        static fields = {
          id: 'primary',
          username: { type: 'string', required: true },
          domain: { type: 'string', required: true },
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

      const model = repo.get('Accounts');

      // Should create record successfully
      const acc1 = await model.create({ username: 'john', domain: 'example.com' });
      expect(acc1.id).toBeDefined();

      // Should allow same username with different domain
      const acc2 = await model.create({ username: 'john', domain: 'other.com' });
      expect(acc2.id).toBeDefined();

      // Should fail with duplicate username + domain
      await expect(model.create({ username: 'john', domain: 'example.com' })).rejects.toThrow();
    });

    test('should support useConstraint option', async () => {
      class Memberships {
        static name = 'Memberships';
        static fields = {
          id: 'primary',
          user_id: { type: 'integer', required: true },
          team_id: { type: 'integer', required: true },
        };
        static indexes = {
          idx_unique_membership: {
            fields: ['user_id', 'team_id'],
            unique: true,
            useConstraint: true,
          },
        };
      }

      repo.register(Memberships);
      await repo.sync({ force: true });

      const model = repo.get('Memberships');
      expect(model.indexes[0].useConstraint).toBe(true);
    });
  });

  describe('Array syntax for indexes', () => {
    test('should support simple array of field names', async () => {
      class Articles {
        static name = 'Articles';
        static fields = {
          id: 'primary',
          title: { type: 'string', required: true },
          slug: { type: 'string', required: true },
          published: { type: 'boolean', default: false },
        };
        static indexes = ['slug', ['title', 'published']];
      }

      repo.register(Articles);
      await repo.sync({ force: true });

      const model = repo.get('Articles');
      expect(model.indexes).toHaveLength(2);
      expect(model.indexes[0].fields).toEqual(['slug']);
      expect(model.indexes[1].fields).toEqual(['title', 'published']);
    });
  });

  describe('Index validation', () => {
    test('should throw error for non-existent field', async () => {
      class BadModel1 {
        static name = 'BadModel1';
        static fields = {
          id: 'primary',
          name: { type: 'string' },
        };
        static indexes = {
          idx_bad: {
            fields: ['nonexistent'],
          },
        };
      }

      repo.register(BadModel1);
      await expect(repo.sync({ force: true })).rejects.toThrow(/non-existent field/);
    });

    test('should throw error for computed field in index', async () => {
      class BadModel2 {
        static name = 'BadModel2';
        static fields = {
          id: 'primary',
          firstname: { type: 'string' },
          lastname: { type: 'string' },
          fullname: {
            type: 'string',
            compute: function () {
              return `${this.firstname} ${this.lastname}`;
            },
            stored: false,
          },
        };
        static indexes = {
          idx_bad: {
            fields: ['fullname'],
          },
        };
      }

      repo.register(BadModel2);
      await expect(repo.sync({ force: true })).rejects.toThrow(/non-stored.*computed/);
    });

    test('should throw error for FULLTEXT with unique', async () => {
      class BadModel3 {
        static name = 'BadModel3';
        static fields = {
          id: 'primary',
          content: { type: 'text' },
        };
        static indexes = {
          idx_bad: {
            fields: ['content'],
            unique: true,
            storage: 'FULLTEXT',
          },
        };
      }

      repo.register(BadModel3);
      await expect(repo.sync({ force: true })).rejects.toThrow(
        /cannot use FULLTEXT storage with unique/
      );
    });

    test('should throw error for empty fields array', async () => {
      class BadModel4 {
        static name = 'BadModel4';
        static fields = {
          id: 'primary',
          name: { type: 'string' },
        };
        static indexes = {
          idx_bad: {
            fields: [],
          },
        };
      }

      repo.register(BadModel4);
      await expect(repo.sync({ force: true })).rejects.toThrow(/at least one field/);
    });
  });

  describe('Field name to column name resolution', () => {
    test('should resolve field names to column names', async () => {
      class Orders {
        static name = 'Orders';
        static fields = {
          id: 'primary',
          customerEmail: { column: 'customer_email', type: 'string', required: true },
          orderDate: { column: 'order_date', type: 'datetime', required: true },
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
      model._init(); // Trigger initialization to validate indexes
      expect(model.indexes[0].fields).toEqual(['customerEmail', 'orderDate']);
      expect(model.indexes[0].columns).toEqual(['customer_email', 'order_date']);
    });
  });

  describe('Partial indexes with predicates', () => {
    test('should support predicate with notNull condition', async () => {
      class Tasks {
        static name = 'Tasks';
        static fields = {
          id: 'primary',
          title: { type: 'string', required: true },
          completed_at: { type: 'datetime', required: false },
        };
        static indexes = {
          idx_active_tasks: {
            fields: ['title'],
            predicate: { completed_at: { isNull: true } },
          },
        };
      }

      repo.register(Tasks);
      await repo.sync({ force: true });

      const model = repo.get('Tasks');
      expect(model.indexes[0].predicate).toEqual({ completed_at: { isNull: true } });
    });

    test('should support predicate with comparison operators', async () => {
      class Events {
        static name = 'Events';
        static fields = {
          id: 'primary',
          name: { type: 'string', required: true },
          priority: { type: 'integer', required: true },
        };
        static indexes = {
          idx_high_priority: {
            fields: ['name'],
            predicate: { priority: { gte: 8 } },
          },
        };
      }

      repo.register(Events);
      await repo.sync({ force: true });

      const model = repo.get('Events');
      expect(model.indexes[0].predicate).toEqual({ priority: { gte: 8 } });
    });
  });

  describe('Index updates during sync', () => {
    test('should handle index changes on subsequent syncs', async () => {
      // First sync with one index
      class Widgets {
        static name = 'Widgets';
        static fields = {
          id: 'primary',
          name: { type: 'string', required: true },
          category: { type: 'string', required: true },
        };
        static indexes = {
          idx_name: {
            fields: ['name'],
          },
        };
      }

      repo.register(Widgets);
      await repo.sync({ force: true });

      let model = repo.get('Widgets');
      expect(model.indexes).toHaveLength(1);

      // Second sync with different index
      repo = new Repository(conn);
      class WidgetsV2 {
        static name = 'Widgets';
        static fields = {
          id: 'primary',
          name: { type: 'string', required: true },
          category: { type: 'string', required: true },
        };
        static indexes = {
          idx_category: {
            fields: ['category'],
          },
        };
      }

      repo.register(WidgetsV2);
      await repo.sync();

      model = repo.get('Widgets');
      expect(model.indexes).toHaveLength(1);
      expect(model.indexes[0].name).toBe('idx_category');
    });
  });

  describe('Long index names', () => {
    test('should truncate and hash very long index names', async () => {
      class Items {
        static name = 'Items';
        static fields = {
          id: 'primary',
          field1: { type: 'string' },
        };
        static indexes = {
          idx_this_is_a_very_long_index_name_that_exceeds_sixty_characters_limit: {
            fields: ['field1'],
          },
        };
      }

      repo.register(Items);
      await repo.sync({ force: true });

      const model = repo.get('Items');
      model._init(); // Trigger initialization to validate and truncate index name
      expect(model.indexes[0].name.length).toBeLessThanOrEqual(60);
      expect(model.indexes[0].name).toContain('_'); // Should contain hash separator
    });
  });

  describe('Index type and storage options', () => {
    test('should support index type option', async () => {
      class Logs {
        static name = 'Logs';
        static fields = {
          id: 'primary',
          message: { type: 'string', required: true },
        };
        static indexes = {
          idx_message: {
            fields: ['message'],
            type: 'hash',
          },
        };
      }

      repo.register(Logs);
      await repo.sync({ force: true });

      const model = repo.get('Logs');
      expect(model.indexes[0].type).toBe('hash');
    });

    test('should warn about FULLTEXT on unsupported databases', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      class Documents {
        static name = 'Documents';
        static fields = {
          id: 'primary',
          content: { type: 'text', required: true },
        };
        static indexes = {
          idx_fulltext: {
            fields: ['content'],
            storage: 'FULLTEXT',
          },
        };
      }

      repo.register(Documents);
      await repo.sync({ force: true });

      // SQLite doesn't support FULLTEXT in this way, so should warn
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('FULLTEXT storage not supported')
      );

      consoleSpy.mockRestore();
    });
  });
});

// Narrow ambient record shape for instance typing in demo getters
type DemoRecord = { firstname?: string; lastname?: string; updated_at?: Date; active?: boolean } & { [k: string]: any };

export class Users {
  static table = 'users';
  static cache = true;
  static order: [string, string][] = [['id', 'desc']];

  static fields = {
    id: 'primary',
    firstname: 'string',
    lastname: { type: 'string', required: true },
    email: { type: 'string', unique: true, required: true },
    password_hash: { type: 'string', size: 64, required: true },
    active: { type: 'boolean', default: true },
    posts: { type: 'one-to-many', foreign: 'Posts.author_id' },
    comments: { type: 'one-to-many', foreign: 'Comments.author_id' },
    status: { type: 'enum', default: 'user', values: ['user', 'admin', 'moderator'] },
    created_at: { type: 'datetime', default: () => new Date() },
    updated_at: { type: 'datetime', default: () => new Date() },
  } as const;

  static findByEmail(email: string) {
    return (this as any).query().where('email', email).first();
  }

  get name() {
    const self = this as unknown as DemoRecord;
    return `${self.firstname || ''} ${self.lastname || ''}`.trim();
  }

  // Demo convenience helpers (not overriding Record internals directly)
  touch() {
    (this as unknown as DemoRecord).updated_at = new Date();
    return this as any;
  }

  deactivate() {
    (this as unknown as DemoRecord).active = false;
    return (this as any).touch();
  }
}

export default Users;

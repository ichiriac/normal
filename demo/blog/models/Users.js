class Users {
  static table = 'users';
  static cache = true;
  static order = [['id', 'desc']];

  static fields = {
    id: 'primary',
    firstname: 'string',
    lastname: { type: 'string', required: true },
    email: { type: 'string', unique: true, required: true },
    password_hash: { type: 'string', size: 64, required: true },
    active: { type: 'boolean', default: true },
    posts: { type: 'one-to-many', foreign: 'Posts.author_id' },
    comments: { type: 'one-to-many', foreign: 'Comments.author_id' },
    status: {
      type: 'enum',
      default: 'user',
      values: ['user', 'admin', 'moderator'],
    },
    created_at: { type: 'datetime', default: () => new Date() },
    updated_at: { type: 'datetime', default: () => new Date() },
  };

  static findByEmail(email) {
    return this.query().where('email', email).first();
  }

  get name() {
    return `${this.firstname} ${this.lastname}`;
  }

  write(data) {
    data.updated_at = new Date();
    return super.write(data);
  }

  unlink() {
    return this.write({ active: false });
  }
}
// Define name property to override readonly built-in
Object.defineProperty(Users, 'name', {
  value: 'Users',
  writable: false,
  enumerable: false,
  configurable: true,
});

module.exports = Users;


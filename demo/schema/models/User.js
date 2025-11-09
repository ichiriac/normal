class User {
  static table = 'users';
  static fields = {
    id: 'primary',
    firstname: { type: 'string', required: true },
    lastname: { type: 'string', required: true },
    email: { type: 'string', unique: true, required: true },
    password_hash: { type: 'string', required: true },
    profile_picture: { type: 'string', required: false },
    created_at: { type: 'datetime', default: () => new Date() },
    updated_at: { type: 'datetime', default: () => new Date() },
    group_id: { type: 'many-to-one', model: 'Groups', required: false },
  };
}

// Define name property to override readonly built-in
Object.defineProperty(User, 'name', {
  value: 'Users',
  writable: false,
  enumerable: false,
  configurable: true,
});

module.exports = User;

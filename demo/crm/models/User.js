class User {
  static table = 'users';
  static inherits = 'Contact';
  static mixins = ['MessageMixin'];

  static fields = {
    id: 'primary',
    email: { type: 'string', size: 100, required: true, unique: true },
    password_hash: { type: 'string', size: 255, required: true },
    created_at: { type: 'timestamp', default: () => new Date() },
    updated_at: { type: 'timestamp', default: () => new Date() },
  };
}

// Define name property to override readonly built-in
Object.defineProperty(User, 'name', {
  value: 'User',
  writable: false,
  enumerable: false,
  configurable: true,
});

module.exports = User;

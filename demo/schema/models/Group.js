class Group {
  static table = 'groups';
  static fields = {
    id: 'primary',
    name: { type: 'string', unique: true, required: true },
    description: { type: 'string', required: false },
    created_at: { type: 'datetime', default: () => new Date() },
    updated_at: { type: 'datetime', default: () => new Date() },
    users: { type: 'one-to-many', foreign: 'User.group_id' },
  };
}

// Define name property to override readonly built-in
Object.defineProperty(Group, 'name', {
  value: 'Groups',
  writable: false,
  enumerable: false,
  configurable: true,
});

module.exports = Group;

class Tags {
  static table = 'tags';
  static cache = false;
  static fields = {
    id: 'primary',
    name: { type: 'string', unique: true, required: true },
    created_at: { type: 'datetime', default: () => new Date() },
    updated_at: { type: 'datetime', default: () => new Date() },
    posts: { type: 'many-to-many', model: 'Posts' },
  };
}
// Define name property to override readonly built-in
Object.defineProperty(Tags, 'name', {
  value: 'Tags',
  writable: false,
  enumerable: false,
  configurable: true,
});

module.exports = Tags;

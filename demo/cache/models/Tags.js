class Tags {
  static table = 'tags';
  static cache = 300;
  static fields = {
    id: 'primary',
    name: { type: 'string', unique: true, required: true },
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

class Comments {
  static table = 'comments';
  static cache = 120;
  static fields = {
    id: 'primary',
    post: { type: 'many-to-one', model: 'Posts', cascade: true },
    author: { type: 'string', required: true },
    content: { type: 'text', required: true },
    created_at: { type: 'datetime', default: () => new Date() },
  };
}

// Define name property to override readonly built-in
Object.defineProperty(Comments, 'name', {
  value: 'Comments',
  writable: false,
  enumerable: false,
  configurable: true,
});

module.exports = Comments;


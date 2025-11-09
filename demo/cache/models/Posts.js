class Posts {
  static table = 'posts';
  static cache = 300;
  static fields = {
    id: 'primary',
    title: { type: 'string', required: true },
    body: { type: 'text', required: true },
    category: { type: 'many-to-one', model: 'Categories' },
    tags: { type: 'many-to-many', model: 'Tags' },
    comments: { type: 'one-to-many', foreign: 'Comments.post' },
  };
}

// Define name property to override readonly built-in
Object.defineProperty(Posts, 'name', {
  value: 'Posts',
  writable: false,
  enumerable: false,
  configurable: true,
});

module.exports = Posts;


class Categories {
  static table = 'categories';
  static cache = 300; // enable model-level caching with 5min TTL by default
  static fields = {
    id: 'primary',
    name: { type: 'string', unique: true, required: true },
    posts: { type: 'one-to-many', foreign: 'Posts.category' },
  };
}

// Define name property to override readonly built-in
Object.defineProperty(Categories, 'name', {
  value: 'Categories',
  writable: false,
  enumerable: false,
  configurable: true,
});

module.exports = Categories;


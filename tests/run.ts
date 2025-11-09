// @ts-nocheck - Test file with implicit any types
const Normal = require('../index');
const db = new Normal.Connection({
  client: 'sqlite3',
  debug: false,
  connection: {
    filename: ':memory:',
  },
});
const repo = new Normal.Repository(db);
repo.register(
  class Posts {
    static _name = 'Posts';
    static table = 'posts';
    static cache = true;
    static fields = {
      id: 'primary',
      title: { type: 'string', unique: true, required: false },
      content: { type: 'string', required: true },
    };
  }
);

(async () => {
  await repo.sync({ force: true });
  await repo.Posts.create({
    title: 'First Post',
    content: 'This is the content of the first post.',
  });
  const post = await repo.Posts.findOne({ title: 'First Post' });
  console.log('Created Post:', post.toJSON());
})()
  .then(() => {
    console.log('Database synced successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Error syncing database:', err);
    process.exit(1);
  });

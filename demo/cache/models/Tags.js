class Tags {
  static table = 'tags';
  static cache = 300;
  static fields = {
    id: 'primary',
    name: { type: 'string', unique: true, required: true },
    posts: { type: 'many-to-many', model: 'Posts' },
  };
}



module.exports = Tags;

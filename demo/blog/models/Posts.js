class Posts {
  static name = "Posts";
  static table = "posts";
  static cache = true;
  static fields = {
    id: 'primary',
    title: { type: "string", unique: true, required: false },
    content: { type: "string", required: true },
    author_id: { type: "many-to-one", required: true, model: "Users" },
    created_at: { type: "datetime", default: () => new Date() },
    updated_at: { type: "datetime", default: () => new Date() },
    tags: { type: "many-to-many", model: "Tags" },
    comments: { type: "one-to-many", foreign: "Comments.post_id" },
  };
}
module.exports = Posts;
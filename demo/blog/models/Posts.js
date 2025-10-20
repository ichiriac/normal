class Posts {
  static name = "Posts";
  static table = "posts";
  static fields = {
    id: 'primary',
    title: { type: "string", unique: true, nullable: false },
    content: { type: "string", nullable: false },
    author_id: { type: "many-to-one", model: "Users" },
    created_at: { type: "datetime", default: () => new Date() },
    updated_at: { type: "datetime", default: () => new Date() },
    tags: { type: "many-to-many", model: "Tags" },
    comments: { type: "one-to-many", foreign: "Comments.post_id" },
  };
}
module.exports = Posts;
class Posts {
  static name = "Posts";
  static table = "posts";
  static fields = {
    id: { type: "number", primary: true, generated: true },
    title: { type: "string", unique: true, nullable: false },
    content: { type: "string", nullable: false },
    author_id: { type: "number", nullable: false, foreign: "Users.id" },
    created_at: { type: "datetime", default: () => new Date() },
    updated_at: { type: "datetime", default: () => new Date() },
    tags: { type: "collection", foreign: "TagsPosts.post_id" },
    comments: { type: "collection", foreign: "Comments.post_id" },
  };
}
module.exports = Posts;

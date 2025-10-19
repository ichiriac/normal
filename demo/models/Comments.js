class Comments {
  static name = "Comments";
  static table = "comments";
  static fields = {
    id: { type: "number", primary: true, generated: true },
    content: { type: "string", nullable: false },
    post_id: { type: "number", nullable: false, foreign: "Posts.id" },
    author_id: { type: "number", nullable: false, foreign: "Users.id" },
    created_at: { type: "datetime", default: () => new Date() },
    updated_at: { type: "datetime", default: () => new Date() },
  };
}
module.exports = Comments;

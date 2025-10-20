class Comments {
  static name = "Comments";
  static table = "comments";
  static fields = {
    id: "primary",
    content: "text",
    post_id: { type: "many-to-one", nullable: false, model: "Posts" },
    author_id: { type: "many-to-one", nullable: false, model: "Users" },
    created_at: { type: "datetime", default: () => new Date() },
    updated_at: { type: "datetime", default: () => new Date() },
  };
}
module.exports = Comments;

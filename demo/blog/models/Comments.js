class Comments {
  static name = "Comments";
  static table = "comments";
  static cache = 120;
  static fields = {
    id: "primary",
    content: "text",
    post_id: { type: "many-to-one", required: true, model: "Posts" },
    author_id: { type: "many-to-one", required: true, model: "Users" },
    created_at: { type: "datetime", default: () => new Date() },
    updated_at: { type: "datetime", default: () => new Date() },
  };
}
module.exports = Comments;

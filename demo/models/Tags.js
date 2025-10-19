class Tags {
  static name = "Tags";
  static table = "tags";
  static fields = {
    id: { type: "number", primary: true, generated: true },
    name: { type: "string", unique: true, nullable: false },
    created_at: { type: "datetime", default: () => new Date() },
    updated_at: { type: "datetime", default: () => new Date() },
    posts: { type: "collection", foreign: "TagsPosts.tag_id" },
  };
}
module.exports = Tags;

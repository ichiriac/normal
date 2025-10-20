class Users {
  static name = "Users";
  static table = "users";
  static order = [["id", "desc"]];

  static fields = {
    id: { type: "primary" },
    firstname: { type: "string", unique: true, nullable: false },
    lastname: { type: "string", unique: true, nullable: false },
    email: { type: "string", unique: true, nullable: false },
    password_hash: { type: "string", nullable: false },
    active: { type: "boolean", default: true },
    posts: { type: "one-to-many", foreign: "Posts.author_id" },
    comments: { type: "one-to-many", foreign: "Comments.author_id" },
    status: {
      type: "string",
      default: "user",
      enum: ["user", "admin", "moderator"],
    },
    created_at: { type: "datetime", default: () => new Date() },
    updated_at: { type: "datetime", default: () => new Date() },
  };

  static findByEmail(email) {
    return this.query().where("email", email).first();
  }

  static create(data) {
    data.created_at = new Date();
    data.updated_at = new Date();
    return super.create(data);
  }

  get name() {
    return `${this.firstname} ${this.lastname}`;
  }

  write(data) {
    data.updated_at = new Date();
    return super.write(data);
  }

  unlink() {
    return this.write({ active: false });
  }
}
module.exports = Users;

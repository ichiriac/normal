class Users {
  static name = "Users";

  static fields = {
    picture: { type: "string", nullable: true },
  };

  get profilePictureUrl() {
    if (this.picture) {
      return `https://cdn.example.com/profiles/${this.picture}`;
    }
    return "https://cdn.example.com/profiles/default.png";
  }
}
module.exports = Users;

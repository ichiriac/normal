class Users {
  static name = "Users";

  static fields = {
    picture: { type: "string", required: false },
  };

  get profilePictureUrl() {
    if (this.picture) {
      return `https://cdn.example.com/profiles/${this.picture}`;
    }
    return "https://cdn.example.com/profiles/default.png";
  }
}
module.exports = Users;

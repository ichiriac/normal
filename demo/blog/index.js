/**
 * Demo script for a blog application using Normal ORM
 */

const Normal = require("../../index");
const db = new Normal.Connection({
  client: "sqlite3",
  connection: {
    filename: ":memory:",
  },
});
const repo = new Normal.Repository(db);

// registers demo models { name: ModelClass, ... } or [ModelClass, ...]
const models = require("./models/index");
repo.register(models);

// extends an existing model with extra fields and methods
const UserExtension = require("./extend/Users")
repo.register(UserExtension);

// Initialize the database and sync the models
async function demo() {
  await repo.sync({ force: true });
  repo.transaction(async (tx) => {
    const Users = tx.get("Users");
    const Posts = tx.get("Posts");
    const user = await Users.create({
      firstname: "John",
      lastname: "Doe",
      email: "john.doe@example.com",
      password_hash: "hashed_password",
    });
    const sportsTag = await tx.get("Tags").create({ name: "sports" });
    const carTag = await tx.get("Tags").create({ name: "car" });
    const post = await Posts.create({
      title: "First Post",
      content: "This is the content of the first post.",
      author_id: user.id,
      tags: [carTag.id],
    });
    post.tags.add(sportsTag);
    post.tags.remove(carTag);

    console.log("User's full name:", user.name);
    console.log("Profile Picture URL:", user.profilePictureUrl);
    console.log("Post created with title:", post.title);
    console.log(
      "Post tags:",
      (await post.tags.load()).map((tag) => tag.name)
    );
    process.exit(0);
  });
}

demo().catch((err) => {
  console.error("Error initializing database:", err);
});

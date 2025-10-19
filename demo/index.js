const Norm = require("../index");
const db = new Norm.Connection({
  client: "sqlite3",
  connection: {
    filename: ":memory:",
  },
});
const repo = new Norm.Repository(db);
const models = require("./models/index");
repo.register(models);
repo.register(require("./extend/Users"));

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
  });
}

demo().catch((err) => {
  console.error("Error initializing database:", err);
});

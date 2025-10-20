/**
 * Demo script for a blog application using Normal ORM
 */

const Normal = require("../../index");
const fs = require("fs");
const db = new Normal.Connection({
  client: "sqlite3",
  debug: false,
  connection: {
    filename: ":memory:",
  },
});
const repo = new Normal.Repository(db);

fs.readdirSync(__dirname + "/models").forEach((file) => {
    if (file.endsWith(".js")) {
        const modelModule = require("./models/" + file);
        repo.register(modelModule);
    }
});

(async () => {
    // Initialize the database and sync the models
    await repo.sync();
    await repo.transaction(async (tx) => {
        const Users = tx.get("User");
        const john = await Users.create({
            email: "john@example.com",
            name: "John Doe",
            first_name: "John",
            last_name: "Doe",
            password_hash: "hashed_password",
        });
        console.log("Created user:", john.toJSON());
    });
    console.log("Demo completed successfully.");
    process.exit(0);
})().catch((err) => {
  console.error("Error :", err);
  process.exit(1);
});
const path = require("path");
const Normal = require("../../index");
// Create database connection
const db = new Normal.Connection({
  client: "sqlite3",
  debug: true,
  connection: {
    filename: path.join(__dirname, "schema.db"), // Persistent DB for multi-process
  },
});
const repo = new Normal.Repository(db);
const Group = require("./models/Group");
const User = require("./models/User");
repo.register({ Group, User });

(async () => {
    const sql = await repo.sync({ force: true, dryRun: false });
    console.log(sql);
})().catch((err) => {
  console.error("Error :", err);
  process.exit(1);
});
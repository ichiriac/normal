const path = require("path");
const Normal = require("../../index");
// Create database connection
const db = new Normal.Connection({
  client: "sqlite3",
  debug: false,
  connection: {
    filename: path.join(__dirname, "schema.db"), // Persistent DB for multi-process
  },
});
const repo = new Normal.Repository(db);
const Group = require("./models/Group");
const User = require("./models/User");
repo.register({ Group, User });

(async () => {

  // initialize the database, emptuy existing schema
  console.log(
    '*** Statements to create schema: ***\n\n',
    (await repo.sync({ force: true })).join("\n")
  );

  // change the schema by adding a new field to User model
  const Users = repo.get('Users');
  Users.extends(class {
    static fields = {
      age: { type: 'number', required: false, default: null }
    }
  });
  console.log(
    '\n\n*** Statements to sync schema: ***\n\n',
    (await repo.sync({ force: false })).join("\n")
  );

  process.exit(0);
})().catch((err) => {
  console.error("Error :", err);
  process.exit(1);
});
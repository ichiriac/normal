const path = require("path");
const Normal = require("../../index");

// Create database connection
const db = new Normal.Connection({
  client: "sqlite3",
  debug: false,
  connection: {
    filename: path.join(__dirname, "schema.db"), // persistent file to see changes across runs
  },
});

const repo = new Normal.Repository(db);
const Group = require("./models/Group");
const User = require("./models/User");

// Register initial models
repo.register({ Group, User });

function banner(title) {
  console.log("\n\n=== " + title + " ===\n");
}

(async () => {
  // 1) Fresh create (force) – creates all tables from scratch
  banner("Initial create (force: true)");
  const createSql = await repo.sync({ force: true });
  console.log(createSql.join("\n"));

  // 2) Add a new field to Users (age) – preview with dryRun, then apply
  banner("Add field Users.age (dryRun)");
  const Users = repo.get("Users");
  Users.extends(class {
    static fields = {
      age: { type: "number", required: false, default: null },
    };
  });
  const addFieldDryRun = await repo.sync({ dryRun: true });
  console.log(addFieldDryRun.join("\n"));

  // Note: We previewed Users.age with dryRun only to illustrate preview capability.
  // Next we'll APPLY a different change (Groups.notes) to demonstrate actual execution.

  // 3) Change a field type – add Groups.notes as string, then change to text
  banner("Add Groups.notes (string) and apply");
  const Groups = repo.get("Groups");
  Groups.extends(class {
    static fields = {
      notes: { type: "string", required: false },
    };
  });
  const addNotesApply = await repo.sync({});
  console.log(addNotesApply.join("\n"));

  banner("Change Groups.notes type to text (dryRun only)");
  Groups.extends(class {
    static fields = {
      notes: { type: "text", required: false },
    };
  });
  try {
    const changeTypeDryRun = await repo.sync({ dryRun: true });
    console.log(changeTypeDryRun.join("\n"));
  } catch (e) {
    console.log("(dry run failed to compute type change)", e?.message || e);
  }

  // 4) Demonstrate no-op sync (no changes)
  banner("No changes (dryRun)");
  // Revert the previous notes type change in model definition so DB and model match
  Groups.extends(class {
    static fields = {
      notes: { type: "string", required: false },
    };
  });
  const noopDryRun = await repo.sync({ dryRun: true });
  console.log(noopDryRun.length ? noopDryRun.join("\n") : "(no statements)\n");

  process.exit(0);
})().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
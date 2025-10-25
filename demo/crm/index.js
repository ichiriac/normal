/**
 * Demo script for a blog application using Normal ORM
 */

const { count } = require("console");
const Normal = require("../../index");
const fs = require("fs");
const { emit } = require("process");
const db = new Normal.Connection({
  client: "sqlite3",
  debug: true,
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

        const Customers = tx.get("Customer");
        const acme = await Customers.create({
            company_name: "Acme Corp",
            address: "123 Main St",
            city: "Metropolis",
            state: "NY",
            zip: "10001",
            country: "USA",
            first_name: "Alice",
            last_name: "Smith",
            email: "alice.smith@example.com",
            phone: "555-1234"
        });

        //await acme.write({ email: 'alice.new@example.com' });
        console.log("Created customer:", acme.toJSON());

        const Contacts = tx.get("Contact");
        const alice = await Contacts.findByEmail("alice.new@example.com");
        console.log("Found contact:", alice.toJSON());

        await alice.addActivity({
          subject: "Follow up",
          description: "Call to discuss new project",
          due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // one week from now
          user_id: john.id,
        });

        console.log(
          'Alice activities:', (await alice.activities).map(a => a.toJSON())
        );

    });
    console.log("Demo completed successfully.");
    process.exit(0);
})().catch((err) => {
  console.error("Error :", err);
  process.exit(1);
});
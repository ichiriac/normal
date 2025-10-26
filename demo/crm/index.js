/**
 * Demo script for a blog application using Normal ORM
 */
const Normal = require('../../index');
const fs = require('fs');
const db = new Normal.Connection({
  client: 'sqlite3',
  debug: false,
  connection: {
    filename: ':memory:',
  },
});
const repo = new Normal.Repository(db);

fs.readdirSync(__dirname + '/models').forEach((file) => {
  if (file.endsWith('.js')) {
    const modelModule = require('./models/' + file);
    repo.register(modelModule);
  }
});

(async () => {
  // Initialize the database and sync the models
  await repo.sync();
  await repo.transaction(async (tx) => {
    const Users = tx.get('User');
    const john = await Users.create({
      email: 'john@example.com',
      name: 'John Doe',
      first_name: 'John',
      last_name: 'Doe',
      password_hash: 'hashed_password',
    });
    console.log('Created user:', john.toJSON());

    const Customers = tx.get('Customer');
    const acme = await Customers.create({
      company_name: 'Acme Corp',
      address: '123 Main St',
      city: 'Metropolis',
      state: 'NY',
      zip: '10001',
      country: 'USA',
      first_name: 'Alice',
      last_name: 'Smith',
      email: 'alice.smith@example.com',
      phone: '555-1234',
    });

    await acme.write({ email: 'alice.new@example.com' });
    console.log('Created customer:', acme.toJSON());

    const Contacts = tx.get('Contact');
    const alice = await Contacts.findByEmail('alice.new@example.com');
    console.log('Found contact:', alice.toJSON());

    await alice.addActivity({
      subject: 'Follow up',
      description: 'Call to discuss new project',
      due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // one week from now
      user_id: john.id,
    });

    console.log(
      'Alice activities:',
      (await alice.activities).map((a) => a.toJSON())
    );

    const Quotations = tx.get('Quotation');
    const quote = await Quotations.create({
      customer_id: acme.id,
      quote_number: 'Q-1001',
      date: new Date(),
      status: 'draft',
      lines: [
        { description: 'Website Development', quantity: 1, unit_price: 5000 },
        { description: 'SEO Services', quantity: 3, unit_price: 1500 },
      ],
    });

    const QuotationLine = tx.get('QuotationLine');
    await QuotationLine.create({
      quotation_id: quote.id,
      description: 'Maintenance Package',
      quantity: 12,
      unit_price: 200,
    });

    const quotation = quote.toJSON();
    quotation.total_amount = await quotation.total_amount;
    console.log('Created quotation:', quotation);
    console.log('Requests : ', tx.queryCount);
  });
  console.log('Demo completed successfully.');
  process.exit(0);
})().catch((err) => {
  console.error('Error :', err);
  process.exit(1);
});

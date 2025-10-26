/**
 * Demo script for stocks management system using Normal ORM
 *
 * This demo script shows :
 * - transactions with stock pickings and sales
 * - computed fields (total amount on sales)
 * - state transitions (confirming/cancelling sales and pickings)
 * - relations between models (many-to-one, one-to-many)
 */

const Normal = require('../../index');
const fs = require('fs');
const db = new Normal.Connection({
  client: 'sqlite3',
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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  await repo.sync();

  // init the database with some warehouses and products
  await repo.transaction(async (tx) => {
    const Warehouses = tx.get('warehouses');
    const Products = tx.get('products');

    await Warehouses.create({ code: 'NY', name: 'Main Warehouse', location: 'New York' });
    await Warehouses.create({ code: 'LA', name: 'Secondary Warehouse', location: 'Los Angeles' });
    await Warehouses.create({ code: 'INV', name: 'Inventory', type: 'virtual' });
    await Warehouses.create({ code: 'CUS', name: 'Customers', type: 'virtual' });

    await Products.create({ name: 'Laptop', sku: 'LAP123', price: 1200.0, cost: 800.0 });
    await Products.create({ name: 'Smartphone', sku: 'SMP456', price: 800.0, cost: 500.0 });
    console.log('Initialized warehouses and products');
  });

  // Demo stock operations
  await repo.transaction(async (tx) => {
    const Warehouses = tx.get('warehouses');
    const Products = tx.get('products');
    const Pickings = tx.get('picking');

    const wh1 = await Warehouses.findByCode('NY');
    const wh2 = await Warehouses.findByCode('LA');
    const inventory = await Warehouses.findByCode('INV');
    const prod1 = await Products.findBySKU('LAP123');
    const prod2 = await Products.findBySKU('SMP456');

    // initialize stocks
    const init1 = await Pickings.create({
      origin: 'Initial Stock',
      scheduled_date: new Date(),
      from_warehouse_id: inventory.id,
      to_warehouse_id: wh1.id,
      lines: [
        { product_id: prod1.id, quantity: 50 },
        { product_id: prod2.id, quantity: 100 },
      ],
    });
    await init1.done();
    console.log('Initialized stock levels on warehouse NY');

    // start a transfer from wh1 to wh2
    const transfer = await Pickings.create({
      origin: 'Transfer Order #001',
      scheduled_date: new Date(),
      from_warehouse_id: wh1.id,
      to_warehouse_id: wh2.id,
      lines: [{ product_id: prod1.id, quantity: 10 }],
    });
    await transfer.confirm();
    console.log('Created transfer from NY to LA (pending completion)');
  });

  await Promise.all([
    repo.transaction(async (tx) => {
      await wait(500); // simulate some delay
      const Pickings = tx.get('picking');
      const transfer = await Pickings.where({ origin: 'Transfer Order #001' }).first();
      console.log('Processing transfer from NY to LA...');
      await wait(1500); // simulate some delay
      await transfer.done();
      console.log('Completed transfer from NY to LA');
    }),
    repo.transaction(async (tx) => {
      await wait(500); // simulate some delay

      const Warehouses = tx.get('warehouses');
      const Products = tx.get('products');
      const Sales = tx.get('sales');

      const wh2 = await Warehouses.findByCode('LA');
      const prod2 = await Products.findBySKU('SMP456');
      const customers = await Warehouses.findByCode('CUS');

      // start a sale from wh2 to customers
      const sale = await Sales.create({
        order_date: new Date(),
        customer_name: 'John Doe',
        from_warehouse_id: wh2.id,
        to_warehouse_id: customers.id,
        lines: [{ product_id: prod2.id, quantity: 5 }],
      });
      await sale.confirm();
    }),
  ]);
  process.exit(0);
})().catch((err) => {
  console.error('Error syncing stocks models:', err);
  process.exit(1);
});

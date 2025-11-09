class Sale {
  static table = 'sale_order';
  static fields = {
    id: 'primary',
    order_date: { type: 'datetime', default: () => new Date() },
    customer_name: { type: 'string', required: true },
    state: { type: 'enum', values: ['draft', 'confirmed', 'cancelled'], default: 'draft' },
    total_amount: {
      type: 'float',
      compute: 'computeTotal',
      depends: ['lines', 'lines.line_total'],
    },
    from_warehouse_id: {
      type: 'many-to-one',
      model: 'warehouses',
      required: true,
      where: { type: 'internal' },
    },
    to_warehouse_id: { type: 'many-to-one', model: 'warehouses', required: true },
    lines: { type: 'one-to-many', foreign: 'sale_lines.sale_id' },
    picking_ids: { type: 'one-to-many', foreign: 'picking.sale_id' },
  };

  computeTotal() {
    if (!this.lines) return 0;
    return this.lines.reduce((sum, line) => sum + line.line_total, 0);
  }

  async confirm() {
    this.state = 'confirmed';
    const picking = await this.repo.get('picking').create({
      origin: `Sale Order #${this.id}`,
      scheduled_date: new Date(),
      from_warehouse_id: this.from_warehouse_id,
      to_warehouse_id: this.to_warehouse_id,
      sale_id: this.id,
      lines: this.lines.map((line) => ({
        product_id: line.product_id,
        quantity: line.quantity,
      })),
    });
    await picking.confirm();
  }

  async cancel() {
    this.state = 'cancelled';
    for (const picking of this.picking_ids) {
      if (picking.state !== 'done') {
        await picking.cancel();
      } else {
        throw new Error(`Cannot cancel sale order with done pickings (Picking ID: ${picking.id})`);
      }
    }
  }
}
// Define name property to override readonly built-in
Object.defineProperty(Sale, 'name', {
  value: 'sales',
  writable: false,
  enumerable: false,
  configurable: true,
});

module.exports = Sale;


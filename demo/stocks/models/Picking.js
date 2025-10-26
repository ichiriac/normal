class Picking {
  static name = 'picking';
  static table = 'stock_picking';
  static fields = {
    id: 'primary',
    origin: { type: 'string', required: false },
    scheduled_date: { type: 'datetime', required: true },
    state: { type: 'enum', values: ['draft', 'confirmed', 'done', 'cancelled'], default: 'draft' },
    from_warehouse_id: { type: 'many2one', model: 'warehouses', required: true },
    to_warehouse_id: { type: 'many2one', model: 'warehouses', required: true },
    sale_id: { type: 'many2one', model: 'sales', required: false },
    lines: { type: 'one-to-many', foreign: 'moves.picking_id' },
  };

  confirm() {
    this.state = 'confirmed';
    this.lines.forEach((line) => line.reserve());
  }

  done() {
    this.state = 'done';
    this.lines.forEach((line) => line.done());
  }

  cancel() {
    this.state = 'cancelled';
    this.lines.forEach((line) => line.cancel());
  }
}
module.exports = Picking;

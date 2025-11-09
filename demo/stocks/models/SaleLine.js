class SaleLine {
  static table = 'sale_order_line';
  static fields = {
    id: 'primary',
    sale_id: { type: 'many2one', model: 'sales', required: true },
    product_id: { type: 'many2one', model: 'products', required: true },
    quantity: { type: 'float', required: true, default: 1 },
    unit_price: { type: 'float', required: true },
    line_total: { type: 'float', compute: 'computeLineTotal', depends: ['quantity', 'unit_price'] },
  };

  computeLineTotal() {
    return this.quantity * this.unit_price;
  }

  isAvailable() {
    // Logic to check if the product is available in stock
  }
}
// Define name property to override readonly built-in
Object.defineProperty(SaleLine, 'name', {
  value: 'sale_lines',
  writable: false,
  enumerable: false,
  configurable: true,
});

module.exports = SaleLine;


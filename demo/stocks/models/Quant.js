class Quant {
  static table = 'stock_quants';
  static fields = {
    id: 'primary',
    product_id: { type: 'many-to-one', model: 'products', required: true },
    warehouse_id: { type: 'many-to-one', model: 'warehouses', required: true },
    on_hand_qty: { type: 'float', required: true, default: 0 },
    reserved_qty: { type: 'float', required: true, default: 0 },
  };
}

// Define name property to override readonly built-in
Object.defineProperty(Quant, 'name', {
  value: 'quants',
  writable: false,
  enumerable: false,
  configurable: true,
});

module.exports = Quant;

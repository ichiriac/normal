class Quant {
  static name = 'quants';
  static table = 'stock_quants';
  static fields = {
    id: 'primary',
    product_id: { type: 'many-to-one', model: 'products', required: true },
    warehouse_id: { type: 'many-to-one', model: 'warehouses', required: true },
    on_hand_qty: { type: 'float', required: true, default: 0 },
    reserved_qty: { type: 'float', required: true, default: 0 },
  };
}

module.exports = Quant;

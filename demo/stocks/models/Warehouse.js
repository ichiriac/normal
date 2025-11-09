class Warehouse {
  static table = 'stock_warehouse';
  static fields = {
    id: 'primary',
    name: { type: 'string', required: true },
    code: { type: 'string', unique: true, index: true },
    type: { type: 'enum', values: ['internal', 'virtual'], default: 'internal' },
  };

  static async findByCode(code) {
    return await this.where({ code }).first();
  }
}
// Define name property to override readonly built-in
Object.defineProperty(Warehouse, 'name', {
  value: 'warehouses',
  writable: false,
  enumerable: false,
  configurable: true,
});

module.exports = Warehouse;

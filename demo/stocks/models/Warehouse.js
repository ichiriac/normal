class Warehouse {
  static name = 'warehouses';
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
module.exports = Warehouse;

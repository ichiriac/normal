class Warehouse {
    static name = 'warehouses';
    static table = 'stock_warehouse';
    static fields = {
        id: 'primary',
        name: { type: 'string', required: true, unique: true },
        type: { type: 'enum', values: ['internal', 'virtual'], default: 'internal' },
        location: { type: 'string', required: true },
    };
}
module.exports = Warehouse;
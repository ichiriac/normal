class Sale {
    static name = 'sales';
    static table = 'sale_order';
    static fields = {
        id: 'primary',
        order_date: { type: 'datetime', default: () => new Date() },
        customer_name: { type: 'string', required: true },
        total_amount: { type: 'float', compute: 'computeTotal', depends: ['lines', 'lines.line_total'] },
        warehouse_id: { type: 'many-to-one', model: 'warehouses', required: true },
        lines: { type: 'one-to-many', foreign: 'sale_lines.sale_id' },
    };

    computeTotal() {
        if (!this.lines) return 0;
        return this.lines.reduce((sum, line) => sum + line.line_total, 0);
    }

}
module.exports = Sale;
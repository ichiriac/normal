class Moves {
    static name = 'moves';
    static table = 'move_lines';
    static fields = {
        id: 'primary',
        picking_id: { type: 'many2one', model: 'picking', required: true },
        warehouse_id: { type: 'many2one', model: 'warehouses', required: true },
        product_id: { type: 'many2one', model: 'products', required: true },
        quantity: { type: 'float', nullable: false },
        reserved_quantity: { type: 'float', nullable: false, default: 0 },
        done_quantity: { type: 'float', nullable: false, default: 0 },
        state: { type: 'enum', values: ['draft', 'reserved', 'done', 'cancelled'], default: 'draft' },
        moved_at: { type: 'datetime', default: () => new Date() },
    };

    reserve() {
        this.state = 'reserved';
    }

    done() {
        this.state = 'done';
    }

    cancel() {
        this.state = 'cancelled';
    }
}

module.exports = Moves;
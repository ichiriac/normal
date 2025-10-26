class QuotationLine {
  static name = 'QuotationLine';
  static table = 'quotation_lines';

  static fields = {
    id: 'primary',
    quotation_id: { type: 'many-to-one', model: 'Quotation', required: true },
    description: { column: 'product_name', type: 'string', required: true },
    quantity: { type: 'number', required: true },
    unit_price: { type: 'number', required: true },
    total_price: {
      type: 'number',
      required: true,
      compute: 'computeTotalPrice',
      depends: ['quantity', 'unit_price'],
    },
  };

  computeTotalPrice() {
    return this.quantity * this.unit_price;
  }
}
module.exports = QuotationLine;

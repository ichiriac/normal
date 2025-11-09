class Quotation {
  static table = 'quotations';
  static mixins = ['MessageMixin', 'ActivityMixin'];

  static fields = {
    id: 'primary',
    customer_id: { type: 'many-to-one', model: 'Contact', required: true },
    quote_number: { type: 'string', size: 50, unique: true, required: true },
    date: { type: 'date', default: () => new Date() },
    total_amount: {
      type: 'number',
      default: 0,
      compute: 'computeTotalAmount',
      stored: true,
      depends: ['lines.total_price'],
    },
    status: {
      type: 'enum',
      default: 'draft',
      values: ['draft', 'sent', 'accepted', 'rejected'],
    },
    created_at: { type: 'timestamp', default: () => new Date() },
    updated_at: { type: 'timestamp', default: () => new Date() },
    lines: { type: 'one-to-many', foreign: 'QuotationLine.quotation_id' },
  };

  async computeTotalAmount() {
    return (await this.lines).reduce((sum, line) => sum + line.total_price, 0);
  }
}

// Define name property to override readonly built-in
Object.defineProperty(Quotation, 'name', {
  value: 'Quotation',
  writable: false,
  enumerable: false,
  configurable: true,
});

module.exports = Quotation;


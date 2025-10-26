class Product {
  static name = 'products';
  static table = 'product_product';

  static fields = {
    name: { type: 'string', required: true, unique: false },
    sku: { type: 'string', required: false, unique: true },
    price: { type: 'float', required: false },
    cost: { type: 'float', required: false },
    description: 'text',
  };

  static async findBySKU(sku) {
    return await this.where({ sku }).first();
  }

  async getAvailableQuantity() {
    // Logic to get available quantity for the product
  }
}
module.exports = Product;

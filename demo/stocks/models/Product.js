class Product {
    static name = 'products';
    static table = 'product_product';

   static fields = {
       id: 'primary',
       name: { type: 'string', required: true, unique: true },
       price: { type: 'float', required: false },
       cost: { type: 'float', required: false },
       description: { type: 'string', required: true },
   };

   async getAvailableQuantity() {
       // Logic to get available quantity for the product
   }
}
module.exports = Product;
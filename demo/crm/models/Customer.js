class Customer {
    static name = 'Customer';
    static table = 'customers';
    static inherits = 'Contact';

    static fields = {
        id: 'primary',
        company_name: { type: 'string', size: 200, required: true },
        address: { type: 'string', size: 300, required: false },
        city: { type: 'string', size: 100, required: false },
        state: { type: 'string', size: 100, required: false },
        zip_code: { type: 'string', size: 20, required: false },
        country: { type: 'string', size: 100, required: false },
        created_at: { type: 'timestamp', defaultToNow: true },
        updated_at: { type: 'timestamp', defaultToNow: true },
    };
}

module.exports = Customer;
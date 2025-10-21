class Customer {
    static name = 'Customer';
    static table = 'customers';
    static inherits = 'contact';

    static fields = {
        id: 'primary',
        company_name: { type: 'string', length: 200, required: true },
        address: { type: 'string', length: 300, required: false },
        city: { type: 'string', length: 100, required: false },
        state: { type: 'string', length: 100, required: false },
        zip_code: { type: 'string', length: 20, required: false },
        country: { type: 'string', length: 100, required: false },
        created_at: { type: 'timestamp', defaultToNow: true },
        updated_at: { type: 'timestamp', defaultToNow: true },
    };
}
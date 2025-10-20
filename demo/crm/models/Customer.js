class Customer {
    static name = 'Customer';
    static table = 'customers';
    static inherits = 'contact';

    static fields = {
        id: 'primary',
        company_name: { type: 'string', length: 200, notNullable: true },
        address: { type: 'string', length: 300 },
        city: { type: 'string', length: 100 },
        state: { type: 'string', length: 100 },
        zip_code: { type: 'string', length: 20 },
        country: { type: 'string', length: 100 },
        created_at: { type: 'timestamp', defaultToNow: true },
        updated_at: { type: 'timestamp', defaultToNow: true },
    };
}
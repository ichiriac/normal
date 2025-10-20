class Contact {
    static name = 'Contact';
    static table = 'contacts';
    static mixin = ['MessageMixin', 'ActivityMixin'];

    static fields = {
        id: 'primary',
        first_name: { type: 'string', length: 100, notNullable: true },
        last_name: { type: 'string', length: 100, notNullable: true },
        email: { type: 'string', length: 200, notNullable: true, unique: true },
        phone: { type: 'string', length: 20 },
        created_at: { type: 'timestamp', defaultToNow: true },
        updated_at: { type: 'timestamp', defaultToNow: true },
    };
}

module.exports = Contact;
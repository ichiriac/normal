class Contact {
    static name = 'Contact';
    static table = 'contacts';
    static mixins = ['MessageMixin', 'ActivityMixin'];

    static fields = {
        id: 'primary',
        first_name: { type: 'string', length: 100, required: true },
        last_name: { type: 'string', length: 100, required: true },
        email: { type: 'string', length: 200, required: true, unique: true },
        phone: { type: 'string', length: 20 },
        created_at: { type: 'timestamp', defaultToNow: true },
        updated_at: { type: 'timestamp', defaultToNow: true },
    };
}

module.exports = Contact;
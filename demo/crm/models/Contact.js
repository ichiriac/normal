class Contact {
    static name = 'Contact';
    static table = 'contacts';
    static mixins = ['MessageMixin', 'ActivityMixin'];

    static fields = {
        id: 'primary',
        class: { type: 'reference' },
        first_name: { type: 'string', size: 100, required: true },
        last_name: { type: 'string', size: 100, required: true },
        email: { type: 'string', size: 200, required: true, unique: true, index: true },
        phone: { type: 'string', size: 20 },
        created_at: { type: 'timestamp', default: () => new Date() },
        updated_at: { type: 'timestamp', default: () => new Date() },
    };
}

module.exports = Contact;
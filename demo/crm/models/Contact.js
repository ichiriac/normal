class Contact {
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

  static findByEmail(email) {
    return this.query().where('email', email).first();
  }
}

// Define name property to override readonly built-in
Object.defineProperty(Contact, 'name', {
  value: 'Contact',
  writable: false,
  enumerable: false,
  configurable: true,
});

module.exports = Contact;

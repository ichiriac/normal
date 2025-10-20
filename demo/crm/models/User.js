class User {
    static name = 'User';
    static table = 'users';
    static inherits = 'Contact';
    static mixins = ['MessageMixin'];

    static fields = {
        id: 'primary',
        email: { type: 'string', length: 100, required: true, unique: true },
        password_hash: { type: 'string', length: 255, required: true },
        created_at: { type: 'timestamp', default: () => new Date() },
        updated_at: { type: 'timestamp', default: () => new Date() },
    };
}

module.exports = User;
class User {
    static name = 'User';
    static table = 'users';
    static inherits = 'contact';

    static fields = {
        id: 'primary',
        email: { type: 'string', length: 100, notNullable: true, unique: true },
        password_hash: { type: 'string', length: 255, notNullable: true },
        created_at: { type: 'timestamp', defaultToNow: true },
        updated_at: { type: 'timestamp', defaultToNow: true },
    };
}

module.exports = User;
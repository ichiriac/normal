class User {
    static name = "Users";
    static table = "users";
    static fields = {
        id: 'primary',
        firstname: { type: 'string', required: true },
        lastname: { type: 'string', required: true },
        email: { type: 'string', unique: true, required: true },
        password_hash: { type: 'string', required: true },
        profile_picture: { type: 'string', required: false },
        created_at: { type: 'datetime', default: () => new Date() },
        updated_at: { type: 'datetime', default: () => new Date() },
        group_id: { type: 'many-to-one', model: 'Groups', required: false }
    };
}

module.exports = User;
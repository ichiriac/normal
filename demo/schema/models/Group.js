class Group {
    static name = "Groups";
    static table = "groups";
    static fields = {
        id: 'primary',
        name: { type: 'string', unique: true, required: true },
        description: { type: 'string', required: false },
        created_at: { type: 'datetime', default: () => new Date() },
        updated_at: { type: 'datetime', default: () => new Date() },
        users: { type: 'one-to-many', foreign: 'User.group_id' }
    };
}

module.exports = Group; 
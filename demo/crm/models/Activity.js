
class Activity {
    static name = 'Activity';
    static table = 'activities';

    static fields = {
        id: 'primary',
        subject: { type: 'string', length: 200, notNullable: true },
        description: { type: 'text' },
        due_date: { type: 'date' },
        user_id: { type: 'many2one', model: 'User' },
        res_model: { type: 'string', length: 100 },
        res_id: { type: 'integer' },
        completed: { type: 'boolean', defaultTo: false },
        created_at: { type: 'timestamp', defaultToNow: true },
        updated_at: { type: 'timestamp', defaultToNow: true },
    };
}

module.exports = Activity;
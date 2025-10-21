
class Activity {
    static name = 'Activity';
    static table = 'activities';

    static fields = {
        id: 'primary',
        subject: { type: 'string', length: 200, required: true },
        description: { type: 'text', required: false },
        due_date: { type: 'date', required: false },
        user_id: { type: 'many2one', model: 'User', required: true },
        res_model: { type: 'string', length: 100, required: false },
        res_id: { type: 'integer', required: false },
        completed: { type: 'boolean', defaultTo: false },
        created_at: { type: 'timestamp', defaultToNow: true },
        updated_at: { type: 'timestamp', defaultToNow: true },
    };
}

module.exports = Activity;
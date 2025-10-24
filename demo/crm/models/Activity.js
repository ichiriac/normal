
class Activity {
    static name = 'Activity';
    static table = 'activities';

    static fields = {
        id: 'primary',
        subject: { type: 'string', size: 200, required: true },
        description: { type: 'text', required: false },
        due_date: { type: 'date', required: false },
        user_id: { type: 'many2one', model: 'User', required: true },
        res_model: { type: 'string', size: 100, required: false },
        res_id: { type: 'integer', required: false },
        completed: { type: 'boolean', default: false },
        created_at: { type: 'timestamp', default: () => new Date() },
        updated_at: { type: 'timestamp', default: () => new Date() },
    };
}

module.exports = Activity;
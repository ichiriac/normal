
class Message {
    static name = 'Message';
    static table = 'messages';

    static fields = {
        id: 'primary',
        subject: { type: 'string', length: 200, required: true },
        body: { type: 'text' },
        sender_id: { type: 'many2one', model: 'Contact' },
        recipient_id: { type: 'many2one', model: 'Contact' },
        sent_at: { type: 'timestamp', defaultToNow: true },
        res_model: { type: 'string', length: 100 },
        res_id: { type: 'integer' },
        is_read: { type: 'boolean', defaultTo: false },
        created_at: { type: 'timestamp', defaultToNow: true },
        updated_at: { type: 'timestamp', defaultToNow: true },
    };
}
module.exports = Message;
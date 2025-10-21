
class Lead {
    static name = 'Lead';
    static table = 'leads';
    static mixin = ['MessageMixin', 'ActivityMixin'];

    static fields = {
        id: 'primary',
        title: { type: 'string', length: 200, required: true },
        description: { type: 'text', required: false },
        contact_id: { type: 'many2one', model: 'Contact', required: true },
        status: { type: 'string', length: 50, defaultTo: 'new', required: false },
        created_at: { type: 'timestamp', defaultToNow: true, required: false },
        updated_at: { type: 'timestamp', defaultToNow: true, required: false },
    };

    static onCreate(entity) {
        console.log(`Lead created: ${entity.title}`);
        entity.publish(null, entity.contact_id, 'New Lead Created', `A new lead titled "${entity.title}" has been created.`);
    }
}

module.exports = Lead;
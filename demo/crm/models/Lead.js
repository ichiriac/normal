class Lead {
  static name = 'Lead';
  static table = 'leads';
  static mixin = ['MessageMixin', 'ActivityMixin'];

  static fields = {
    id: 'primary',
    title: { type: 'string', size: 200, required: true },
    description: { type: 'text', required: false },
    contact_id: { type: 'many2one', model: 'Contact', required: true },
    status: { type: 'enum', values: ['new', 'in_progress', 'closed'], default: 'new' },
    created_at: { type: 'timestamp', defaultToNow: true, required: false },
    updated_at: { type: 'timestamp' },
  };

  static onCreate(entity) {
    console.log(`Lead created: ${entity.title}`);
    entity.publish(
      null,
      entity.contact_id,
      'New Lead Created',
      `A new lead titled "${entity.title}" has been created.`
    );
  }
}

module.exports = Lead;

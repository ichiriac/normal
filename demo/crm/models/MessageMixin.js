class MessageMixin {
  static abstract = true;

  static fields = {
    messages: {
      type: 'one2many',
      foreign: 'Message',
      where: function (record) {
        return {
          res_model: record.model.name,
          res_id: record.id,
        };
      },
    },
  };

  publish(sender_id, recipient_id, subject, body) {
    console.log(`Message published from ${sender_id} to ${recipient_id}: ${subject} - ${body}`);
    const Message = this._model.repo.get('Message');
    return Message.create({
      sender_id: sender_id,
      recipient_id: recipient_id,
      subject: subject,
      body: body,
      res_model: this.name,
      res_id: this.id,
    });
  }
}

// Define name property to override readonly built-in
Object.defineProperty(MessageMixin, 'name', {
  value: 'MessageMixin',
  writable: false,
  enumerable: false,
  configurable: true,
});

module.exports = MessageMixin;

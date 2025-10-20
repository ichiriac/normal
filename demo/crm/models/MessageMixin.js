class MessageMixin {
    static name = 'MessageMixin';
    static abstract = true;
        
    static fields = {
        messages: { type: "many2one", model: "Message", backref: "res_model,res_id" },
    }

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

module.exports = MessageMixin;

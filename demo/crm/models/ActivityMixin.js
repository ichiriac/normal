class ActivityMixin {
    static name = 'ActivityMixin';
    static abstract = true;
        
    static fields = {
        activities: { 
            type: "one2many", 
            foreign: "Activity", 
            domain: function(record) {
                return {
                    res_model: record.model.name,
                    res_id: record.id,
                };
            }
        },
    }

}

module.exports = ActivityMixin;
class ActivityMixin {
    static name = 'ActivityMixin';
    static abstract = true;
        
    static fields = {
        activities: { type: "many2one", model: "Activity", backref: "res_model,res_id" },
    }

}
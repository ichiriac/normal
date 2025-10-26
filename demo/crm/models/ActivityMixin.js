class ActivityMixin {
    static name = 'ActivityMixin';
    static abstract = true;
        
    static fields = {
        activities: { 
            type: "one2many", 
            foreign: "Activity", 
            where: function(record) {
                return {
                    res_model: record._model.name,
                    res_id: record.id,
                };
            }
        },
    }

    /**
     * Helper for adding an activity linked to this record.
     * @param {*} subject 
     * @param {*} description 
     * @param {*} due_date 
     * @param {*} user_id 
     * @returns 
     */
    async addActivity({ subject, description, due_date, user_id }) {
        const Activity = this._repo.get('Activity');
        return await Activity.create({
            subject,
            description,
            due_date,
            user_id,
            res_model: this._model.name,
            res_id: this.id,
        });
    }

}

module.exports = ActivityMixin;
class Queue {
    static name = 'Queue';
    static table = 'queues';
    static fields = {
        name: { type: 'string', unique: true, required: true },
        last_error: { type: 'datetime', required: false },
        job_count: { type: 'number', default: 0 },
        pending_jobs: { type: 'number', default: 0 },
        completed_jobs: { type: 'number', default: 0 },
        created_at: { type: 'datetime', default: () => new Date() },
        updated_at: { type: 'datetime', default: () => new Date() },
        jobs: { type: 'one-to-many', foreign: 'Job.queue_id' }
    };

    // Instance method to update job counts
    async updateCounts() {
        const Jobs = this.repository.get('Job');
        const pending = await Jobs.query().where('queue_id', this.id).where('status', 'pending');
        const completed = await Jobs.query().where('queue_id', this.id).where('status', 'completed');
        const total = await Jobs.query().where('queue_id', this.id);
        
        return this.write({
            job_count: total.length,
            pending_jobs: pending.length,
            completed_jobs: completed.length,
            updated_at: new Date()
        });
    }

    write(data) {
        data.updated_at = new Date();
        return super.write(data);
    }
}

module.exports = Queue;
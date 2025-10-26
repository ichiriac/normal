class Job {
  static name = 'Job';
  static table = 'jobs';
  static fields = {
    id: 'primary',
    queue_id: { type: 'many-to-one', model: 'Queue', required: true },
    payload: { type: 'json', required: true }, // JSON string for compatibility
    result: { type: 'json', required: false }, // JSON string for results
    status: {
      type: 'enum',
      default: 'pending',
      values: ['pending', 'in_progress', 'completed', 'failed'],
    },
    attempts: { type: 'number', default: 0 },
    last_error: { type: 'datetime', required: false },
    scheduled_at: { type: 'datetime', default: () => new Date() },
    completed_at: { type: 'datetime', required: false },
    created_at: { type: 'datetime', default: () => new Date() },
    updated_at: { type: 'datetime', default: () => new Date() },
  };

  // Override write to handle JSON serialization
  write(data) {
    data.updated_at = new Date();
    return super.write(data);
  }

  // Check if job should be retried
  shouldRetry(maxAttempts = 3) {
    return this.status === 'failed' && this.attempts < maxAttempts;
  }

  // Mark job for retry
  async retry() {
    return this.write({
      status: 'pending',
      scheduled_at: new Date(Date.now() + this.attempts * 30000), // Exponential backoff
    });
  }
}

module.exports = Job;

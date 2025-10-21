# Workers Demo - Job Queue System

A comprehensive demonstration of a multi-process job queue system built with Normal ORM, showcasing distributed job processing, performance monitoring, and multi-worker coordination.

## 🚀 Overview

This demo implements a production-ready job queue system where a master process creates jobs and multiple worker processes compete to process them. It demonstrates Normal ORM's capabilities for building scalable, fault-tolerant background job systems.

## 🏗️ Architecture

### Master Process
- **Database Setup**: Creates and syncs `queues` and `jobs` tables
- **Queue Management**: Sets up 4 different job queues for different job types
- **Job Creation**: Generates 20 sample jobs across various categories
- **Worker Coordination**: Forks 4 worker processes and monitors their status
- **Performance Monitoring**: Tracks real-time statistics and memory usage

### Worker Processes (4 forks)
- **Job Claiming**: Uses atomic database operations to claim jobs without race conditions
- **Job Processing**: Handles different job types with realistic processing times
- **Error Handling**: Captures failures and updates job status appropriately
- **Status Updates**: Maintains job state transitions (pending → in_progress → completed/failed)

### Database Models

#### Queue Model (`models/Queue.js`)
```javascript
static fields = {
  id: 'primary',
  name: { type: 'string', unique: true, required: true },
  job_count: { type: 'number', default: 0 },
  pending_jobs: { type: 'number', default: 0 },
  completed_jobs: { type: 'number', default: 0 },
  jobs: { type: 'one-to-many', foreign: 'Job.queue_id' }
}
```

#### Job Model (`models/Job.js`)
```javascript
static fields = {
  id: 'primary',
  queue_id: { type: 'number', foreign: 'Queue.id', required: true },
  payload: { type: 'string', required: true }, // JSON serialized
  result: { type: 'string', nullable: true },
  status: { type: 'string', default: 'pending', enum: ['pending', 'in_progress', 'completed', 'failed'] },
  attempts: { type: 'number', default: 0 },
  scheduled_at: { type: 'datetime', default: () => new Date() },
  completed_at: { type: 'datetime', nullable: true },
  queue: { type: 'many-to-one', model: 'Queue' }
}
```

## 📋 Job Types

The demo creates 5 different job types with realistic processing characteristics:

### 1. **Email Jobs** (5 jobs)
- **Purpose**: Send welcome emails to new users
- **Processing Time**: 500-1500ms
- **Payload**: `{ to, subject, template }`
- **Result**: `{ messageId, recipient, status }`

### 2. **Image Resize Jobs** (3 jobs)
- **Purpose**: Resize and optimize uploaded images
- **Processing Time**: 1-3 seconds
- **Payload**: `{ imagePath, targetSize, format }`
- **Result**: `{ originalSize, newSize, compressionRatio }`

### 3. **Data Sync Jobs** (4 jobs)
- **Purpose**: Synchronize data from external APIs
- **Processing Time**: 200-1000ms
- **Payload**: `{ source, destination, syncType }`
- **Result**: `{ recordsSynced, source, destination }`

### 4. **Report Generation Jobs** (2 jobs)
- **Purpose**: Generate analytics and sales reports
- **Processing Time**: 2-5 seconds
- **Payload**: `{ reportType, dateRange }`
- **Result**: `{ reportId, pages, fileSize }`

### 5. **Webhook Jobs** (6 jobs)
- **Purpose**: Send notifications to external services
- **Processing Time**: 100-600ms
- **Payload**: `{ url, event, payload }`
- **Result**: `{ url, status, responseTime }`
- **Special**: 10% simulated failure rate

## 🔧 Key Features

### Multi-Process Safety
- **Atomic Job Claiming**: Uses database transactions to prevent race conditions
- **Persistent Storage**: SQLite database shared across all processes
- **Process Isolation**: Each worker runs independently with separate connections

### Performance Monitoring
- **Real-time Statistics**: Live tracking of job queue status every 2 seconds
- **Memory Usage**: RSS, heap, and external memory monitoring
- **Execution Timing**: Individual job processing times
- **Success/Failure Rates**: Complete job outcome tracking

### Error Handling
- **Job Failure Tracking**: Failed jobs marked with error details
- **Retry Logic**: Framework for implementing exponential backoff
- **Worker Recovery**: System continues if individual workers fail
- **Graceful Shutdown**: Waits for all jobs to complete before exit

### Job State Management
```
pending → in_progress → completed
                     → failed
```

## 🚀 Running the Demo

```bash
# Navigate to workers demo
cd demo/workers

# Run the job queue system
node index.js
```

### Expected Output

```
🚀 Starting Job Queue Demo - Master Process

📊 Initial memory usage: { rss: '58.25 MB', heapUsed: '7.02 MB' }

📋 Setting up database...
🗂️  Creating job queues...
✅ Created 4 queues

📝 Creating sample jobs...
✅ Created 20 jobs across 4 queues

👥 Forking 4 worker processes...
🔧 Worker 1 (PID: 1234) started
🔧 Worker 2 (PID: 1235) started
🔧 Worker 3 (PID: 1236) started
🔧 Worker 4 (PID: 1237) started

🔄 Worker 1: Processing job 1 (send_email)
✅ Worker 1: Completed job 1 in 743ms
🔄 Worker 2: Processing job 2 (resize_image)
✅ Worker 2: Completed job 2 in 2.1s

📊 Queue Status: Pending: 15 | In Progress: 3 | Completed: 2 | Failed: 0
💾 Current memory usage: { rss: '65.63 MB', heapUsed: '9.15 MB' }

🎉 All jobs processed! Shutting down workers...

🎯 Final Summary:
   ⏱️  Total execution time: 8.7s
   📝 Total jobs created: 20
   ✅ Jobs completed: 19
   ❌ Jobs failed: 1
   💾 Memory delta: 7.38 MB
```

## 📊 Performance Characteristics

### Scalability
- **Concurrent Processing**: 4 workers processing jobs simultaneously
- **Load Distribution**: Jobs automatically distributed across available workers
- **Memory Efficiency**: ~65MB total memory usage for master + 4 workers

### Throughput
- **Job Processing Rate**: ~2-3 jobs per second (varies by job type)
- **Queue Coordination**: Sub-millisecond job claiming operations
- **Database Performance**: SQLite handles concurrent worker access efficiently

### Fault Tolerance
- **Worker Failures**: System continues operating if individual workers crash
- **Job Recovery**: Failed jobs can be identified and retried
- **Database Consistency**: ACID transactions ensure data integrity

## 🛠️ Customization

### Adding New Job Types
1. Add job type constant to `JOB_TYPES`
2. Implement processing function (e.g., `simulateNewJobType()`)
3. Add case to `processJob()` switch statement
4. Create jobs with new type in master process

### Scaling Workers
Change the worker count in the master process:
```javascript
// Fork N workers instead of 4
for (let i = 0; i < N; i++) {
  const worker = cluster.fork({ WORKER_ID: i + 1 });
}
```

### Different Databases
Switch from SQLite to PostgreSQL:
```javascript
const db = new Normal.Connection({
  client: "pg",
  connection: {
    host: "localhost",
    database: "job_queue",
    user: "postgres",
    password: "password"
  }
});
```

## 🎯 Production Considerations

### Database Optimization
- Add indexes on `status` and `scheduled_at` for faster job queries
- Consider partitioning jobs table for high-volume systems
- Implement job archival for completed jobs

### Monitoring & Observability
- Add structured logging with job IDs and worker IDs
- Implement metrics collection (Prometheus, StatsD)
- Set up alerting for high failure rates or queue backlog

### Reliability Improvements
- Implement exponential backoff for failed jobs
- Add job timeouts to prevent stuck jobs
- Consider using Redis for higher-performance job queuing

### Security
- Validate job payloads before processing
- Implement job payload encryption for sensitive data
- Add authentication for job creation endpoints

## 💡 Use Cases

This pattern is ideal for:
- **Email Processing**: Sending transactional emails, newsletters
- **Media Processing**: Image/video resizing, format conversion
- **Data Integration**: ETL processes, API synchronization  
- **Report Generation**: Analytics, scheduled reports
- **Webhook Delivery**: Event notifications, third-party integrations
- **Background Tasks**: Cleanup jobs, maintenance operations

## 🔗 Related Demos

- `demo/blog/` - Basic CRUD operations and relations
- `demo/crm/` - Business workflow modeling
- `demo/stocks/` - Inventory management patterns

This workers demo showcases Normal ORM's ability to handle complex, distributed systems while maintaining clean, understandable code and excellent performance characteristics.

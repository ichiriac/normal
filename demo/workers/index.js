/**
 * Demo script for a job queue system using Normal ORM
 * Creates queues, jobs, and forks 4 workers to process them
 */

const Normal = require("../../index");
const cluster = require("cluster");
const path = require("path");

// Performance monitoring utilities
function formatMemory(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    rss: formatMemory(usage.rss),
    heapTotal: formatMemory(usage.heapTotal),
    heapUsed: formatMemory(usage.heapUsed),
    external: formatMemory(usage.external),
    arrayBuffers: formatMemory(usage.arrayBuffers || 0)
  };
}

// Job types and handlers
const JOB_TYPES = {
  EMAIL: 'send_email',
  IMAGE_RESIZE: 'resize_image',
  DATA_SYNC: 'sync_data',
  REPORT_GENERATE: 'generate_report',
  WEBHOOK: 'send_webhook'
};

// Create database connection
const db = new Normal.Connection({
  client: "sqlite3",
  debug: false,
  connection: {
    filename: path.join(__dirname, "jobs.db"), // Persistent DB for multi-process
  },
});
const repo = new Normal.Repository(db);

// Register models
const Queue = require("./models/Queue");
const Job = require("./models/Job");

// Job processor functions
async function processJob(job, workerId) {
  const startTime = Date.now();
  console.log(`🔄 Worker ${workerId}: Processing job ${job.id} (${job.payload.type})`);
  
  try {
    let result = {};
    
    switch (job.payload.type) {
      case JOB_TYPES.EMAIL:
        result = await simulateEmailSend(job.payload.data);
        break;
      case JOB_TYPES.IMAGE_RESIZE:
        result = await simulateImageResize(job.payload.data);
        break;
      case JOB_TYPES.DATA_SYNC:
        result = await simulateDataSync(job.payload.data);
        break;
      case JOB_TYPES.REPORT_GENERATE:
        result = await simulateReportGeneration(job.payload.data);
        break;
      case JOB_TYPES.WEBHOOK:
        result = await simulateWebhookSend(job.payload.data);
        break;
      default:
        throw new Error(`Unknown job type: ${job.payload.type}`);
    }
    
    const processingTime = Date.now() - startTime;
    console.log(`✅ Worker ${workerId}: Completed job ${job.id} in ${processingTime}ms`);
    
    return { success: true, result, processingTime };
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.log(`❌ Worker ${workerId}: Failed job ${job.id} after ${processingTime}ms - ${error.message}`);
    
    return { success: false, error: error.message, processingTime };
  }
}

// Simulate different job types
async function simulateEmailSend(data) {
  await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500)); // 500-1500ms
  return { 
    messageId: `msg_${Date.now()}`,
    recipient: data.to,
    subject: data.subject,
    status: 'sent'
  };
}

async function simulateImageResize(data) {
  await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000)); // 1-3s
  return {
    originalSize: data.originalSize,
    newSize: data.targetSize,
    format: data.format,
    compressionRatio: Math.random() * 0.3 + 0.4 // 40-70%
  };
}

async function simulateDataSync(data) {
  await new Promise(resolve => setTimeout(resolve, Math.random() * 800 + 200)); // 200-1000ms
  return {
    recordsSynced: Math.floor(Math.random() * 1000) + 100,
    source: data.source,
    destination: data.destination,
    syncType: data.syncType
  };
}

async function simulateReportGeneration(data) {
  await new Promise(resolve => setTimeout(resolve, Math.random() * 3000 + 2000)); // 2-5s
  return {
    reportId: `rpt_${Date.now()}`,
    type: data.reportType,
    pages: Math.floor(Math.random() * 50) + 5,
    fileSize: `${(Math.random() * 5 + 1).toFixed(2)}MB`
  };
}

async function simulateWebhookSend(data) {
  await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 100)); // 100-600ms
  if (Math.random() < 0.1) { // 10% failure rate
    throw new Error('Webhook endpoint unreachable');
  }
  return {
    url: data.url,
    status: 200,
    responseTime: Math.floor(Math.random() * 200 + 50) + 'ms'
  };
}

// Master process - setup and job creation
async function masterProcess() {
  console.log("🚀 Starting Job Queue Demo - Master Process\n");
  
  const startTime = process.hrtime.bigint();
  const initialMemory = process.memoryUsage();
  
  console.log("📊 Initial memory usage:", getMemoryUsage());
  
  // Register models and sync database
  console.log("\n📋 Setting up database...");
  repo.register({ Queue, Job });
  await repo.sync({ force: true });
  
  // Create job queues
  console.log("\n🗂️  Creating job queues...");
  const queues = await Promise.all([
    repo.get('Queue').create({
      name: 'email_queue',
      job_count: 0,
      pending_jobs: 0,
      completed_jobs: 0
    }),
    repo.get('Queue').create({
      name: 'image_queue',
      job_count: 0,
      pending_jobs: 0,
      completed_jobs: 0
    }),
    repo.get('Queue').create({
      name: 'data_queue',
      job_count: 0,
      pending_jobs: 0,
      completed_jobs: 0
    }),
    repo.get('Queue').create({
      name: 'report_queue',
      job_count: 0,
      pending_jobs: 0,
      completed_jobs: 0
    })
  ]);
  
  console.log(`✅ Created ${queues.length} queues`);
  
  // Create sample jobs
  console.log("\n📝 Creating sample jobs...");
  const jobs = [];
  
  // Email jobs
  for (let i = 0; i < 5; i++) {
    jobs.push({
      queue_id: queues[0].id,
      payload: {
        type: JOB_TYPES.EMAIL,
        data: {
          to: `user${i}@example.com`,
          subject: `Welcome Email ${i + 1}`,
          template: 'welcome'
        }
      },
      status: 'pending',
      attempts: 0,
      scheduled_at: new Date()
    });
  }
  
  // Image resize jobs
  for (let i = 0; i < 3; i++) {
    jobs.push({
      queue_id: queues[1].id,
      payload: {
        type: JOB_TYPES.IMAGE_RESIZE,
        data: {
          imagePath: `/uploads/image_${i}.jpg`,
          targetSize: { width: 800, height: 600 },
          format: 'webp'
        }
      },
      status: 'pending',
      attempts: 0,
      scheduled_at: new Date()
    });
  }
  
  // Data sync jobs
  for (let i = 0; i < 4; i++) {
    jobs.push({
      queue_id: queues[2].id,
      payload: {
        type: JOB_TYPES.DATA_SYNC,
        data: {
          source: `api_endpoint_${i}`,
          destination: 'main_db',
          syncType: 'incremental'
        }
      },
      status: 'pending',
      attempts: 0,
      scheduled_at: new Date()
    });
  }
  
  // Report generation jobs
  for (let i = 0; i < 2; i++) {
    jobs.push({
      queue_id: queues[3].id,
      payload: {
        type: JOB_TYPES.REPORT_GENERATE,
        data: {
          reportType: i === 0 ? 'monthly_sales' : 'user_analytics',
          dateRange: '2024-01-01 to 2024-01-31'
        }
      },
      status: 'pending',
      attempts: 0,
      scheduled_at: new Date()
    });
  }
  
  // Webhook jobs
  for (let i = 0; i < 6; i++) {
    jobs.push({
      queue_id: queues[0].id, // Use email queue for webhooks too
      payload: {
        type: JOB_TYPES.WEBHOOK,
        data: {
          url: `https://api.example.com/webhook/${i}`,
          event: 'user.created',
          payload: { userId: 1000 + i }
        }
      },
      status: 'pending',
      attempts: 0,
      scheduled_at: new Date()
    });
  }
  
  // Insert all jobs
  for (const jobData of jobs) {
    // Ensure payload is properly serialized
    const serializedJob = {
      ...jobData
    };
    await repo.get('Job').create(serializedJob);
  }
  
  console.log(`✅ Created ${jobs.length} jobs across ${queues.length} queues`);
  
  // Update queue counters
  for (const queue of queues) {
    const jobCount = jobs.filter(j => j.queue_id === queue.id).length;
    await queue.write({
      job_count: jobCount,
      pending_jobs: jobCount
    });
  }
  
  console.log("\n👥 Forking 4 worker processes...");
  
  // Fork 4 workers
  const workers = [];
  for (let i = 0; i < 4; i++) {
    const worker = cluster.fork({ WORKER_ID: i + 1 });
    workers.push(worker);
    console.log(`🔧 Worker ${i + 1} (PID: ${worker.process.pid}) started`);
  }
  
  // Monitor workers
  let activeWorkers = workers.length;
  let totalJobsProcessed = 0;
  let totalJobsCompleted = 0;
  let totalJobsFailed = 0;
  
  const statusInterval = setInterval(async () => {
    return;
    try {
      const pendingJobs = await repo.get('Job').query().where('status', 'pending');
      const inProgressJobs = await repo.get('Job').query().where('status', 'in_progress');
      const completedJobs = await repo.get('Job').query().where('status', 'completed');
      const failedJobs = await repo.get('Job').query().where('status', 'failed');
      
      console.log(`\n📊 Queue Status: Pending: ${pendingJobs.length} | In Progress: ${inProgressJobs.length} | Completed: ${completedJobs.length} | Failed: ${failedJobs.length}`);
      console.log(`💾 Current memory usage:`, getMemoryUsage());
      
      if (pendingJobs.length === 0 && inProgressJobs.length === 0) {
        console.log("\n🎉 All jobs processed! Shutting down workers...");
        clearInterval(statusInterval);
        
        // Shutdown workers
        workers.forEach(worker => worker.kill());
        
        // Final summary
        const totalTime = Number(process.hrtime.bigint() - startTime) / 1e6;
        const finalMemory = process.memoryUsage();
        const memoryDelta = finalMemory.rss - initialMemory.rss;
        
        console.log("\n🎯 Final Summary:");
        console.log(`   ⏱️  Total execution time: ${totalTime.toFixed(2)}ms`);
        console.log(`   📝 Total jobs created: ${jobs.length}`);
        console.log(`   ✅ Jobs completed: ${completedJobs.length}`);
        console.log(`   ❌ Jobs failed: ${failedJobs.length}`);
        console.log(`   💾 Memory delta: ${formatMemory(memoryDelta)}`);
        console.log(`   📊 Final memory usage:`, getMemoryUsage());
        
        await db.destroy();
        process.exit(0);
      }
    } catch (error) {
      console.error("Error checking job status:", error);
    }
  }, 2000); // Check every 2 seconds
  
  cluster.on('exit', (worker, code, signal) => {
    activeWorkers--;
    console.log(`🔴 Worker ${worker.process.pid} died (${signal || code}). Active workers: ${activeWorkers}`);
    
    if (activeWorkers === 0) {
      console.log("❌ All workers died. Exiting...");
      clearInterval(statusInterval);
      process.exit(1);
    }
  });
}

// Worker process - job processing
async function workerProcess() {
  const workerId = process.env.WORKER_ID || process.pid;
  console.log(`🔧 Worker ${workerId} starting...`);
  
  // Create separate DB connection for worker
  const workerRepo = new Normal.Repository(db);
  workerRepo.register({ Queue, Job });
  
  let jobsProcessed = 0;
  let jobsCompleted = 0;
  let jobsFailed = 0;
  
  async function processNextJob() {
    try {
      // Find next pending job using a simple FIFO approach
      // In production, you might want more sophisticated job selection
      const jobs = await workerRepo.get('Job').query()
        .where('status', 'pending')
        .whereRaw('scheduled_at <= ?', [new Date()])
        .orderBy('scheduled_at', 'asc')
        .limit(1);
      
      if (jobs.length === 0) {
        // No jobs available, wait a bit
        await new Promise(resolve => setTimeout(resolve, 1000));
        return;
      }
      
      const job = jobs[0];
      
      // Try to claim the job atomically
      const updatedRows = await workerRepo.get('Job').query()
        .where('id', job.id)
        .where('status', 'pending') // Ensure it's still pending
        .update({
          status: 'in_progress',
          attempts: job.attempts + 1
        });
      
      if (updatedRows === 0) {
        // Job was claimed by another worker
        return;
      }
      
      // Reload job to get the updated data
      const updatedJob = await workerRepo.get('Job').findById(job.id);
      jobsProcessed++;
      
      // Process the job - need to get the parsed payload
      let parsedPayload;
      try {
        parsedPayload = JSON.parse(updatedJob.payload || '{}');
      } catch (e) {
        console.error(`Worker ${workerId}: Invalid payload JSON for job ${updatedJob.id}`);
        parsedPayload = {};
      }
      
      const jobData = {
        id: updatedJob.id,
        payload: parsedPayload
      };
      
      const result = await processJob(jobData, workerId);
      
      if (result.success) {
        // Mark job as completed
        await updatedJob.write({
          status: 'completed',
          result: result.result,
          completed_at: new Date()
        });
        jobsCompleted++;
      } else {
        // Mark job as failed
        await updatedJob.write({
          status: 'failed',
          result: { error: result.error },
          last_error: new Date()
        });
        jobsFailed++;
      }
      
    } catch (error) {
      console.error(`💥 Worker ${workerId} error:`, error.message);
    }
  }
  
  // Main worker loop
  console.log(`✅ Worker ${workerId} ready to process jobs`);
  
  while (true) {
    await processNextJob();
  }
}

// Main execution
async function main() {
  if (cluster.isMaster) {
    await masterProcess();
  } else {
    await workerProcess();
  }
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});


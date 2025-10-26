/**
 * Demo script for a blog application using Normal ORM
 * Includes execution time and memory usage statistics
 */

const Normal = require('../../index');

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
    rss: formatMemory(usage.rss), // Resident Set Size
    heapTotal: formatMemory(usage.heapTotal), // Total heap allocated
    heapUsed: formatMemory(usage.heapUsed), // Heap actually used
    external: formatMemory(usage.external), // External memory (C++ objects)
    arrayBuffers: formatMemory(usage.arrayBuffers || 0), // ArrayBuffers
  };
}

function logPerformance(label, startTime, startMemory) {
  const endTime = process.hrtime.bigint();
  const endMemory = process.memoryUsage();

  const executionTime = Number(endTime - startTime) / 1e6; // Convert to milliseconds
  const memoryDelta = {
    rss: endMemory.rss - startMemory.rss,
    heapUsed: endMemory.heapUsed - startMemory.heapUsed,
    heapTotal: endMemory.heapTotal - startMemory.heapTotal,
  };

  console.log(`\n📊 ${label} Performance:`);
  console.log(`   ⏱️  Execution time: ${executionTime.toFixed(2)}ms`);
  console.log(
    `   💾 Memory delta: RSS ${formatMemory(memoryDelta.rss)}, Heap ${formatMemory(memoryDelta.heapUsed)}`
  );
  console.log(`   📈 Current memory:`, getMemoryUsage());
}

const db = new Normal.Connection({
  client: 'sqlite3',
  debug: false,
  connection: {
    filename: ':memory:',
  },
});
const repo = new Normal.Repository(db);

// Initialize the database and sync the models
async function demo() {
  console.log('🚀 Starting Normal ORM Demo\n');

  // Initial memory state
  const initialMemory = process.memoryUsage();
  const demoStartTime = process.hrtime.bigint();

  console.log('📊 Initial memory usage:', getMemoryUsage());

  // Model registration performance
  console.log('\n📋 Registering models...');
  const registerStartTime = process.hrtime.bigint();
  const registerStartMemory = process.memoryUsage();

  // registers demo models { name: ModelClass, ... } or [ModelClass, ...]
  const models = require('./models/index');
  repo.register(models);

  // extends an existing model with extra fields and methods
  const UserExtension = require('./extend/Users');
  repo.register(UserExtension);

  logPerformance('Model Registration', registerStartTime, registerStartMemory);

  // Schema sync performance
  console.log('\n🔄 Syncing database schema...');
  const syncStartTime = process.hrtime.bigint();
  const syncStartMemory = process.memoryUsage();

  await repo.sync({ force: true });

  logPerformance('Schema Sync', syncStartTime, syncStartMemory);

  // Transaction and data operations performance
  console.log('\n💾 Executing database operations...');
  const opsStartTime = process.hrtime.bigint();
  const opsStartMemory = process.memoryUsage();

  await repo.transaction(async (tx) => {
    const Users = tx.get('Users');
    const Posts = tx.get('Posts');

    // Measure individual operations
    const userCreateStart = process.hrtime.bigint();
    const user = await Users.create({
      firstname: 'John',
      lastname: 'Doe',
      email: 'john.doe@example.com',
      password_hash: 'hashed_password',
    });
    const userCreateTime = Number(process.hrtime.bigint() - userCreateStart) / 1e6;

    const tagCreateStart = process.hrtime.bigint();
    const sportsTag = await tx.get('Tags').create({ name: 'sports' });
    const carTag = await tx.get('Tags').create({ name: 'car' });
    const tagCreateTime = Number(process.hrtime.bigint() - tagCreateStart) / 1e6;

    const postCreateStart = process.hrtime.bigint();
    const post = await Posts.create({
      title: 'First Post',
      content: 'This is the content of the first post.',
      author_id: user.id,
      tags: [carTag.id],
    });
    await post.tags.add(sportsTag);
    const postCreateTime = Number(process.hrtime.bigint() - postCreateStart) / 1e6;

    // Output results with timing
    console.log('\n✅ Demo Results:');
    console.log("User's full name:", user.name);
    console.log('Profile Picture URL:', user.profilePictureUrl);
    console.log('Post created with title:', post.title);
    console.log(
      'Post tags:',
      (await post.tags.load()).map((tag) => tag.name)
    );
    console.log(
      'Posts in tag car :',
      (await carTag.posts.load()).map((p) => p.title)
    );

    console.log('\n⚡ Operation Timings:');
    console.log(`   👤 User creation: ${userCreateTime.toFixed(2)}ms`);
    console.log(`   🏷️  Tag creation: ${tagCreateTime.toFixed(2)}ms`);
    console.log(`   📝 Post creation + tagging: ${postCreateTime.toFixed(2)}ms`);
  });

  logPerformance('Database Operations', opsStartTime, opsStartMemory);

  // Final summary
  const totalTime = Number(process.hrtime.bigint() - demoStartTime) / 1e6;
  const finalMemory = process.memoryUsage();
  const totalMemoryDelta = {
    rss: finalMemory.rss - initialMemory.rss,
    heapUsed: finalMemory.heapUsed - initialMemory.heapUsed,
    heapTotal: finalMemory.heapTotal - initialMemory.heapTotal,
  };

  console.log('\n🎯 Final Summary:');
  console.log(`   ⏱️  Total execution time: ${totalTime.toFixed(2)}ms`);
  console.log(
    `   💾 Total memory delta: RSS ${formatMemory(totalMemoryDelta.rss)}, Heap ${formatMemory(totalMemoryDelta.heapUsed)}`
  );
  console.log(`   📊 Final memory usage:`, getMemoryUsage());

  process.exit(0);
}

demo().catch((err) => {
  console.error('Error initializing database:', err);
});

/*
 * TypeScript version of the NormalJS Blog demo.
 */
// NormalJS Blog Demo (TypeScript variant) with stronger typing
import * as Normal from '../../..';
import models from './models';
import UsersExtend from './extend/UsersExtend';

// Lightweight type helpers for demo records (shape reflects static field definitions)
interface UserRecord {
  id: number;
  firstname: string;
  lastname: string;
  email: string;
  password_hash: string;
  active: boolean;
  status: 'user' | 'admin' | 'moderator';
  created_at: Date;
  updated_at: Date;
  name: string; // getter
  profilePictureUrl?: string; // extension getter
  posts: any; // collection wrapper (ManyToMany / OneToMany not fully typed yet)
  comments: any;
  tags?: any;
}

interface TagRecord { id: number; name: string; posts: any }
interface PostRecord { id: number; title: string; tags: any }

interface TxContext {
  get(modelName: 'Users'): any; // would be Model<UserRecord>
  get(modelName: 'Posts'): any; // Model<PostRecord>
  get(modelName: 'Tags'): any;  // Model<TagRecord>
  get(modelName: 'Comments'): any;
}

function formatMemory(bytes: number): string {
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
    arrayBuffers: formatMemory((usage as any).arrayBuffers || 0),
  };
}

function logPerformance(label: string, startTime: bigint, startMemory: NodeJS.MemoryUsage) {
  const endTime = process.hrtime.bigint();
  const endMemory = process.memoryUsage();
  const executionTime = Number(endTime - startTime) / 1e6;
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

const db = new (Normal as any).Connection({
  client: 'sqlite3',
  debug: false,
  connection: { filename: ':memory:' },
});
const repo = new (Normal as any).Repository(db);

async function demo() {
  console.log('🚀 Starting Normal ORM TS Demo');
  console.log('📊 Initial memory usage:', getMemoryUsage());

  const registerStartTime = process.hrtime.bigint();
  const registerStartMemory = process.memoryUsage();

  repo.register(models as any);
  repo.register(UsersExtend as any);

  logPerformance('Model Registration', registerStartTime, registerStartMemory);

  const syncStartTime = process.hrtime.bigint();
  const syncStartMemory = process.memoryUsage();
  await repo.sync({ force: true });
  logPerformance('Schema Sync', syncStartTime, syncStartMemory);

  const opsStartTime = process.hrtime.bigint();
  const opsStartMemory = process.memoryUsage();
  await repo.transaction(async (tx: TxContext) => {
    const Users = tx.get('Users');
    const Posts = tx.get('Posts');

    const userCreateStart = process.hrtime.bigint();
    const user: UserRecord = await Users.create({
      firstname: 'John',
      lastname: 'Doe',
      email: 'john.doe@example.com',
      password_hash: 'hashed_password',
    });
    const userCreateTime = Number(process.hrtime.bigint() - userCreateStart) / 1e6;

  const sportsTag: TagRecord = await tx.get('Tags').create({ name: 'sports' });
  const carTag: TagRecord = await tx.get('Tags').create({ name: 'car' });

    const postCreateStart = process.hrtime.bigint();
    const post: PostRecord = await Posts.create({
      title: 'First Post',
      content: 'This is the content of the first post.',
      author_id: user.id,
      tags: [carTag.id],
    });
    await post.tags.add(sportsTag);
    const postCreateTime = Number(process.hrtime.bigint() - postCreateStart) / 1e6;

    console.log('\n✅ Demo Results:');
    console.log("User's full name:", user.name);
  console.log('Profile Picture URL:', (user as any).profilePictureUrl);
    console.log('Post created with title:', post.title);
    console.log(
      'Post tags:',
  (await post.tags.load()).map((tag: TagRecord) => tag.name)
    );
    console.log(
      'Posts in tag car :',
  (await carTag.posts.load()).map((p: PostRecord) => p.title)
    );

    console.log('\n⚡ Operation Timings:');
    console.log(`   👤 User creation: ${userCreateTime.toFixed(2)}ms`);
    console.log(`   📝 Post creation + tagging: ${postCreateTime.toFixed(2)}ms`);
  });
  logPerformance('Database Operations', opsStartTime, opsStartMemory);
  await (db as any).destroy();
}

// Execute demo
// eslint-disable-next-line @typescript-eslint/no-floating-promises
 demo().catch((err) => {
  console.error('Error initializing database:', err);
  (db as any).destroy().finally(() => process.exit(1));
});

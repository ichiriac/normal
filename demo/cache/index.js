/* eslint-disable no-console */
'use strict';

const { fork } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');

const { Repository } = require('../../src/Repository');
const { Connection } = require('../../src/Connection');
const Models = require('./models');
const { exit } = require('node:process');

function hrMs(t0, t1) {
    return Number(t1 - t0) / 1e6;
}

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) { return arr[randInt(0, arr.length - 1)]; }

function word() {
    const sy = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua'.split(' ');
    return pick(sy);
}

function sentence(n = 8) {
    return Array.from({ length: n }, () => word()).join(' ');
}

async function buildRepo() {
    const connection = new Connection({
        client: 'sqlite3',
        debug: false,
        connection: { 
            filename: ':memory:'
        },
        useNullAsDefault: true,
        pool: { min: 1, max: 1 },
    });
    const repo = new Repository(connection);
    repo.register(Models);
    await repo.sync({ force: true });
    return repo;
}

async function seed(repo, { posts = 1000, categories = 100, tags = 200, comments = 500 } = {}) {
    const { Categories, Tags, Posts, Comments } = repo.models;

    // Categories
    for (let i = 0; i < categories; i++) {
        await Categories.create({ name: `Category ${i + 1}` });
    }

    // Tags
    for (let i = 0; i < tags; i++) {
        await Tags.create({ name: `tag_${i + 1}` });
    }

    // Posts with random category and 2-5 tags
    const tagIds = Array.from({ length: tags }, (_, i) => i + 1);
    for (let i = 0; i < posts; i++) {
        const category = randInt(1, categories);
        const tagCount = randInt(2, 5);
        const sel = new Set();
        while (sel.size < tagCount) sel.add(pick(tagIds));
        try {
            await Posts.create({
                title: `Post ${i + 1}: ${sentence(6)}`,
                body: sentence(40),
                category,
                tags: Array.from(sel),
            });
        } catch (e) {
            // try again on failure (e.g. unique constraint)
            i--;
        }
    }

    // Initial comments on random posts
    for (let i = 0; i < comments; i++) {
        const post = randInt(1, posts);
        await Comments.create({ post, author: `user_${randInt(1, 1000)}`, content: sentence(12) });
    }
}

async function simulateVisitors(repo, {
    visitors = Math.max(4, os.cpus().length),
    steps = 500,
    commentRate = 0.1,
    ds = {
        posts: 1000,
        categories: 50,
        tags: 60,
        comments: 500,
    },
} = {}) {

    const totals = { categoriesViewed: 0, postsRead: 0, commentsAdded: 0, tagSearches: 0 };

    const runVisitor = async () => {
        try {
            await repo.transaction(async (tx) => {
                const { Categories, Tags, Posts, Comments } = tx.models;
                for (let s = 0; s < steps; s++) {
                    const op = randInt(1, 4);
                    /* if (s % 1 === 0) {
                        console.log(`- Visitor step ${s}/${steps} - operation ${op}`);
                    } */
                    if (op === 1) {
                        // Browse a category
                        const cId = randInt(1, ds.categories);
                        await Posts.where({ category: cId  }).limit(10).cache(10);
                        totals.categoriesViewed++;
                    } else if (op === 2) {
                        // Read a post (and its comments lazily)
                        const pId = randInt(1, ds.posts);
                        const post = await Posts.findById(pId );
                        if (post && Math.random() < commentRate) {
                            await Comments.create({ post: pId, author: `user_${randInt(1, 1000)}`, content: sentence(10) });
                            totals.commentsAdded++;
                        }
                        totals.postsRead++;
                    } else if (op === 3) {
                        // Search posts by a random tag
                        const tId = randInt(1, ds.tags);
                        const tag = await Tags.findById(tId );
                        if (tag) {
                            const rel = tag.posts; // CollectionWrapper
                            await rel.load();
                        }
                        totals.tagSearches++;
                    } else {
                        // Mix: browse category then read one post from it
                        const cId = randInt(1, ds.categories);
                        const posts = await Posts.where({ category: cId  }).limit(10).cache(10);
                        if (Array.isArray(posts) && posts.length > 0) {
                            const p = pick(posts);
                            await Posts.findById(p.id);
                        }
                        totals.categoriesViewed++;
                        totals.postsRead++;
                    }
                }
            });
        } catch (e) {
            console.error('Visitor error:', e);
        }

    };

    const batchSize = 10;
    for (let i = 0; i < visitors; i += batchSize) {
        const visitorsList = [];
        for (let j = 0; j < batchSize; j++) {
            visitorsList.push(runVisitor());
        }
        await Promise.all(visitorsList);
    }
    console.log('- All visitors completed');
    return totals;
}

async function childMain() {
    console.log('--- Starting cache demo child process ---');
    const repo = await buildRepo();
    const ds = {
        posts: +(process.env.POSTS || 500),
        categories: +(process.env.CATEGORIES || 30),
        tags: +(process.env.TAGS || 60),
        comments: +(process.env.COMMENTS || 200),
    };
    console.log('-- ' + JSON.stringify(ds));
    await seed(repo, ds);
    console.log('--- Seeding complete ---');
    repo.resetQueryCount();
    const t0 = process.hrtime.bigint();
    const totals = await simulateVisitors(repo, {
        visitors: +(process.env.VISITORS || 200),
        steps: +(process.env.STEPS || 20),
        commentRate: +(process.env.COMMENT_RATE || 0.15),
        ds
    });
    const t1 = process.hrtime.bigint();
    const metrics = repo.cache ? repo.cache.metrics() : null;
    const out = {
        cacheEnabled: !!repo.cache,
        engine: process.env.CACHE_ENGINE || (process.env.CACHE_ARENA ? 'arena' : 'fixed'),
        elapsedMs: hrMs(t0, t1),
        queries: repo.queryCount,
        totals,
        cacheMetrics: metrics,
    };
    console.log(JSON.stringify(out));
    exit(0);
}

async function parentMain() {
    const script = __filename;
    console.log('Cache showcase demo starting...\n');

    const run = (label, env) => new Promise((resolve, reject) => {
        console.log(`\n=== Running: ${label} ===`);
        const child = fork(script, [], { env: { ...process.env, ...env, CHILD: '1' }, stdio: ['ignore', 'pipe', 'inherit', 'ipc'] });
        let data = '';
        child.stdout.on('data', (chunk) => {
            const output = chunk.toString();
            if (output[0] === '-') {
                console.log(output);
            } else {
                data += output;
            }
        });
        child.on('error', reject);
        child.on('exit', (code) => {
            console.log(`** Child process exited with code ${code} **`);
            if (code !== 0) return reject(new Error(`${label} exited with code ${code}`));
            try {
                const parsed = JSON.parse(data.trim().split(/\n/).pop());
                resolve({ label, result: parsed });
            } catch (e) {
                console.log('Failed to parse child output:', data);
                reject(e);
            }
        });
    });

    const noCache = await run('No Cache', { CACHE_DISABLED: '1' });
    const withCache = await run('With Cache', {
        CACHE_ENGINE: process.env.CACHE_ENGINE || 'arena',
        CACHE_METRICS: '1',
        CACHE_DICT_CAPACITY: process.env.CACHE_DICT_CAPACITY || '20000',
        CACHE_MAX_ENTRIES: process.env.CACHE_MAX_ENTRIES || '12000',
        CACHE_ENTRY_SIZE: process.env.CACHE_ENTRY_SIZE || '16384',
    });

    const fmt = (r) => `${r.label}: time=${r.result.elapsedMs.toFixed(2)}ms, queries=${r.result.queries}, engine=${r.result.engine}, cache=${r.result.cacheEnabled}`;
    console.log('\nResults');
    console.log('-------');
    console.log(fmt(noCache));
    console.log(fmt(withCache));

    if (withCache.result.cacheMetrics) {
        console.log('\nArena Cache metrics snapshot:');
        console.log(withCache.result.cacheMetrics);
    }
}

if (process.env.CHILD === '1') {
    childMain().catch((e) => { console.error(e); process.exit(1); });
} else {
    parentMain().catch((e) => { console.error(e); process.exit(1); });
}
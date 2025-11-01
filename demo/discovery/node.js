'use strict';

const { Connection } = require('../../index');

/**
 * Discovery Protocol Demo Node
 *
 * This demo shows automatic node discovery using UDP multicast.
 * Run multiple instances of this script to see nodes discover each other.
 *
 * Usage:
 *   DISCOVERY_ENABLED=1 node demo/discovery/node.js
 *
 * With custom config:
 *   DISCOVERY_ENABLED=1 DISCOVERY_PORT=45678 node demo/discovery/node.js
 */

async function main() {
  console.log('=== NormalJS Discovery Protocol Demo ===\n');

  // Parse environment variables
  const discoveryEnabled = process.env.DISCOVERY_ENABLED === '1';
  const discoveryPort = parseInt(process.env.DISCOVERY_PORT || '56789', 10);
  const discoveryTTL = parseInt(process.env.DISCOVERY_TTL || '30000', 10);
  const announceInterval = parseInt(process.env.DISCOVERY_ANNOUNCE_INTERVAL || '10000', 10);

  console.log('Configuration:');
  console.log(`  Discovery Enabled: ${discoveryEnabled}`);
  console.log(`  Discovery Port: ${discoveryPort}`);
  console.log(`  Member TTL: ${discoveryTTL}ms`);
  console.log(`  Announce Interval: ${announceInterval}ms\n`);

  if (!discoveryEnabled) {
    console.log('⚠️  Discovery is DISABLED. Set DISCOVERY_ENABLED=1 to enable.\n');
    console.log('Example:');
    console.log('  DISCOVERY_ENABLED=1 node demo/discovery/node.js\n');
    process.exit(0);
  }

  // Create connection with discovery and cache configuration
  const conn = new Connection({
    client: 'sqlite3',
    connection: { filename: ':memory:' },
    cache: {
      enabled: true, // Enable per-connection cache
      maxEntries: 2048,
    },
    discovery: {
      enabled: true,
      discoveryPort: discoveryPort,
      cachePort: 1983,
      ttl: discoveryTTL,
      announceIntervalMs: announceInterval,
      multicastGroup: process.env.DISCOVERY_MULTICAST_GROUP || '239.255.1.1',
      bootstrapRetries: parseInt(process.env.DISCOVERY_BOOTSTRAP_RETRIES || '10', 10),
      packageName: process.env.DISCOVERY_PACKAGE_NAME || 'normaljs-discovery-demo',
      packageVersion: process.env.DISCOVERY_PACKAGE_VERSION || '1.0.0',
      versionPolicy: process.env.DISCOVERY_VERSION_POLICY?.split(',').map((s) => s.trim()) || [
        'major',
        'minor',
      ],
      fallbackSeeds: process.env.DISCOVERY_FALLBACK_SEEDS
        ? process.env.DISCOVERY_FALLBACK_SEEDS.split(',').map((s) => s.trim())
        : [],

      // Event handlers
      onMemberJoin: (member) => {
        console.log(`\n✅ Member JOINED:`);
        console.log(`   Node ID: ${member.nodeId}`);
        console.log(`   Address: ${member.addr}:${member.port}`);
        console.log(`   Package: ${member.package}@${member.version}`);
        console.log(`   Discovery Port: ${member.discoveryPort}`);
        console.log(`   TTL: ${member.ttl}ms`);
        if (member.connections && member.connections.length > 0) {
          console.log(`   Connections: ${member.connections.join(', ')}`);
        }
        // Cache peers are automatically synced
        const cache = conn.getCache();
        if (cache) {
          console.log(`   Cache Peers: ${cache.clusterPeers.length}`);
        }
        printMembershipSummary(conn.getDiscovery());
      },

      onMemberUpdate: (member) => {
        console.log(`\n🔄 Member UPDATED:`);
        console.log(`   Node ID: ${member.nodeId}`);
        console.log(`   Address: ${member.addr}:${member.port}`);
        console.log(`   Last Seen: ${new Date(member.lastSeen).toISOString()}`);
      },

      onMemberLeave: (member) => {
        console.log(`\n❌ Member LEFT:`);
        console.log(`   Node ID: ${member.nodeId}`);
        console.log(`   Address: ${member.addr}:${member.port}`);
        console.log(`   Package: ${member.package}@${member.version}`);
        // Cache peers are automatically synced
        const cache = conn.getCache();
        if (cache) {
          console.log(`   Cache Peers: ${cache.clusterPeers.length}`);
        }
        printMembershipSummary(conn.getDiscovery());
      },

      onError: (err) => {
        console.error(`\n⚠️  Discovery Error: ${err.message}`);
      },
    },
  });

  // Get discovery and cache instances
  const discovery = conn.getDiscovery();
  const cache = conn.getCache();

  console.log('Starting discovery service...');
  console.log(`  Node ID: ${discovery.nodeId}`);
  console.log(`  Package: ${discovery.packageName}@${discovery.packageVersion}`);
  console.log(`  Multicast Group: ${discovery.multicastGroup}`);
  console.log(`  Discovery Port: ${discovery.discoveryPort}`);
  console.log(`  Cache Port: ${discovery.cachePort}`);
  console.log(`  Connection Hash: ${conn.getConnectionHash()}`);
  console.log(`  Cache Enabled: ${cache !== null}\n`);

  // Start discovery
  await conn.startDiscovery();

  console.log('✅ Discovery service started!');
  console.log('📡 Broadcasting announcements...\n');
  console.log('Waiting for other nodes to join...');
  console.log('(Press Ctrl+C to exit)\n');

  // Periodic status updates
  const statusInterval = setInterval(() => {
    printMembershipSummary(discovery);
  }, 15000);
  if (statusInterval.unref) statusInterval.unref();

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\nShutting down...');
    clearInterval(statusInterval);
    await conn.destroy();
    console.log('Goodbye!\n');
    process.exit(0);
  });

  // Keep the process running indefinitely
  await new Promise(() => {
    // This promise never resolves - keeps the process alive
    // until SIGINT (Ctrl+C) is received
  });
}

function printMembershipSummary(discovery) {
  const members = discovery.getMembers();
  console.log(`\n📊 Cluster Membership: ${members.length} member(s)`);
  if (members.length > 0) {
    console.log('   ┌─────────────────────────────────────────────────────────────┐');
    members.forEach((m, idx) => {
      const lastSeenAgo = Date.now() - m.lastSeen;
      const lastSeenStr =
        lastSeenAgo < 1000 ? 'just now' : `${Math.floor(lastSeenAgo / 1000)}s ago`;
      console.log(
        `   │ ${idx + 1}. ${m.addr}:${m.port} (${m.nodeId.substring(0, 8)}) - ${lastSeenStr}`
      );
    });
    console.log('   └─────────────────────────────────────────────────────────────┘');
  }
}

// Run the demo
main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

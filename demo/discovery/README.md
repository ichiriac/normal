# Discovery Protocol Demo

This demo shows how to use the UDP-based local discovery protocol for automatic cache cluster membership.

## Features Demonstrated

1. **Automatic Node Discovery**: Multiple nodes on the same network automatically discover each other
2. **Package Scoping**: Only nodes from the same application (package name + version) join the cluster
3. **Connection-based Authentication**: Discovery uses connection config as the secret key
4. **Member Events**: Track when members join, update, and leave the cluster
5. **Fault Tolerance**: Nodes that crash or disconnect are automatically evicted after TTL expires

## Running the Demo

### Single Node (Manual Configuration)

```bash
node demo/discovery/node.js
```

### Multiple Nodes

Open 3 terminal windows and run:

```bash
# Terminal 1
DISCOVERY_ENABLED=1 node demo/discovery/node.js

# Terminal 2
DISCOVERY_ENABLED=1 node demo/discovery/node.js

# Terminal 3
DISCOVERY_ENABLED=1 node demo/discovery/node.js
```

You should see each node discover the others and print membership updates.

### With Custom Configuration

```bash
DISCOVERY_ENABLED=1 \
DISCOVERY_PORT=45678 \
DISCOVERY_MULTICAST_GROUP=239.255.2.2 \
DISCOVERY_TTL=60000 \
DISCOVERY_ANNOUNCE_INTERVAL=5000 \
node demo/discovery/node.js
```

## Configuration Options

### Environment Variables

- `DISCOVERY_ENABLED=1` - Enable discovery (default: false)
- `DISCOVERY_MULTICAST_GROUP` - Multicast IP (default: 239.255.1.1)
- `DISCOVERY_PORT` - Discovery UDP port (default: 56789)
- `DISCOVERY_TTL` - Member TTL in ms (default: 30000)
- `DISCOVERY_ANNOUNCE_INTERVAL` - Keep-alive interval in ms (default: 10000)
- `DISCOVERY_BOOTSTRAP_RETRIES` - Bootstrap announcements (default: 10)
- `DISCOVERY_PACKAGE_NAME` - Override package name
- `DISCOVERY_PACKAGE_VERSION` - Override package version
- `DISCOVERY_VERSION_POLICY` - e.g., "major,minor" (default: major,minor)
- `DISCOVERY_FALLBACK_SEEDS` - Static seeds: "host1:port,host2:port"

### Programmatic Configuration

```javascript
const { Connection, Repository } = require('normaljs');

const conn = new Connection({
  client: 'pg',
  connection: { host: 'localhost', database: 'mydb' },
  cache: {
    enabled: true, // Enable per-connection cache
    maxEntries: 2048,
  },
  discovery: {
    enabled: true,
    multicastGroup: '239.255.1.1',
    discoveryPort: 56789,
    cachePort: 1983,
    ttl: 30000,
    announceIntervalMs: 10000,
    bootstrapRetries: 10,
    packageName: 'my-app',
    packageVersion: '1.0.0',
    versionPolicy: ['major', 'minor'],
    onMemberJoin: (member) => {
      console.log('Member joined:', member);
      // Cache peers are automatically synced
    },
    onMemberLeave: (member) => {
      console.log('Member left:', member);
      // Cache peers are automatically synced
    },
  },
});

await conn.startDiscovery();

// Create repository - it will use the connection's cache
const repo = new Repository(conn);
```

## How It Works

1. **Bootstrap**: When started, each node sends rapid announcements (1/sec for 10 sec) via multicast
2. **Keep-alive**: After bootstrap, nodes send periodic announcements (every 10 sec)
3. **Membership**: Nodes track other members and update their last-seen timestamp
4. **Eviction**: Members not seen within TTL \* 1.5 are automatically removed
5. **Security**: All messages are signed with HMAC-SHA256 using connection config as secret
6. **Replay Protection**: Messages include timestamp + nonce to prevent replay attacks
7. **Cache Integration**: Discovered members with matching connection hash are automatically added as cache invalidation peers

### Cache-Discovery Integration

Each connection has its own cache instance and discovery engine. When members are discovered:

- Only members with matching **connection hash** are added as cache peers
- Connection hash is derived from the database configuration (client + connection details)
- This ensures nodes connected to the same database can share cache invalidations
- Nodes connected to different databases maintain separate cache clusters

Example with 2 databases:

```javascript
// Connection 1: PostgreSQL database 'app1'
const conn1 = new Connection({
  client: 'pg',
  connection: { host: 'localhost', database: 'app1' },
  cache: { enabled: true },
  discovery: { enabled: true },
});

// Connection 2: PostgreSQL database 'app2'
const conn2 = new Connection({
  client: 'pg',
  connection: { host: 'localhost', database: 'app2' },
  cache: { enabled: true },
  discovery: { enabled: true },
});

// conn1 and conn2 will:
// - Have different connection hashes
// - Discover all nodes but only sync cache with matching hash
// - Maintain separate cache clusters even on same network
```

## Version Scoping

By default, discovery uses a "major.minor" version policy:

- `1.0.0` and `1.0.5` ✓ Compatible (same major.minor)
- `1.0.0` and `1.1.0` ✗ Incompatible (different minor)
- `1.0.0` and `2.0.0` ✗ Incompatible (different major)

This ensures only compatible application versions join the cluster.

## Package Name Resolution

Discovery reads the parent application's `package.json` to determine the package name and version. If your application is `awesome-blog@1.0.0`, only nodes running the same package and compatible version will discover each other.

## Security Considerations

- **Authentication**: All messages are HMAC-signed using the connection config as secret
- **Replay Protection**: Timestamps and nonces prevent replay attacks
- **Package Scoping**: Only matching package names are accepted
- **Version Policy**: Incompatible versions are rejected
- **Network Scope**: Discovery is intended for trusted L2 networks (same subnet)
- **Multicast Blocked**: Falls back to broadcast or static seeds

## Troubleshooting

### No nodes discovered

1. Check firewall allows UDP on discovery port (default 56789)
2. Ensure nodes are on same L2 network
3. Try broadcast fallback if multicast blocked
4. Use `NORMAL_DISCOVERY_DEBUG=1` for debug logs
5. Check package name/version match

### Nodes not evicting

1. Verify TTL settings are reasonable
2. Check network connectivity
3. Ensure nodes are sending keep-alives

### Authentication failures

1. Ensure all nodes use identical connection configs
2. Secret is derived from `{ client, connection }` - must match exactly

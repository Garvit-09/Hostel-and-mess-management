// neo4j.js – Resilient Neo4j Driver Connection & Session Manager
// Supports local Bolt, Neo4j Desktop, and Neo4j Aura (neo4j+s://)
require('dotenv').config();
const neo4j = require('neo4j-driver');

const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
const user = process.env.NEO4J_USERNAME || 'neo4j';
const password = process.env.NEO4J_PASSWORD || '';
const database = process.env.NEO4J_DATABASE || 'neo4j';

let driver = null;
let connectionVerified = false;
let lastError = null;

// Helper: Recursively convert Neo4j types (Integers, Dates, Nodes, Relationships) to standard JS values
function toNative(value) {
  if (value === null || value === undefined) {
    return value;
  }
  if (neo4j.isInt(value)) {
    return neo4j.integer.inSafeRange(value) ? value.toNumber() : value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(toNative);
  }
  if (typeof value === 'object') {
    // If it's a Neo4j Node or Relationship
    if (value.properties && typeof value.properties === 'object') {
      const result = toNative(value.properties);
      if (value.labels) result._labels = value.labels;
      if (value.type) result._type = value.type;
      if (value.identity) result._id = toNative(value.identity);
      return result;
    }
    const clean = {};
    for (const [k, v] of Object.entries(value)) {
      clean[k] = toNative(v);
    }
    return clean;
  }
  return value;
}

// Initialize Driver (lazy / fault-tolerant)
function getDriver() {
  if (!driver) {
    if (!password) {
      lastError = 'NEO4J_PASSWORD environment variable is not configured.';
      return null;
    }
    try {
      driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
        maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 hours
        maxConnectionPoolSize: 50,
        connectionAcquisitionTimeout: 5000,
        logging: {
          level: 'warn',
          logger: (level, message) => console.log(`[NEO4J ${level.toUpperCase()}] ${message}`)
        }
      });
    } catch (err) {
      lastError = err.message;
      driver = null;
    }
  }
  return driver;
}

// Managed query execution: automatically handles session creation, execution, closing, and conversion
async function readQuery(cypher, params = {}) {
  const drv = getDriver();
  if (!drv) {
    throw new Error(`Neo4j driver offline: ${lastError || 'Driver not initialized'}`);
  }
  const session = drv.session({ database, defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.executeRead(async tx => {
      const res = await tx.run(cypher, params);
      return res.records.map(record => {
        const obj = {};
        record.keys.forEach(key => {
          obj[key] = toNative(record.get(key));
        });
        return obj;
      });
    });
    return result;
  } finally {
    await session.close();
  }
}

async function writeQuery(cypher, params = {}) {
  const drv = getDriver();
  if (!drv) {
    throw new Error(`Neo4j driver offline: ${lastError || 'Driver not initialized'}`);
  }
  const session = drv.session({ database, defaultAccessMode: neo4j.session.WRITE });
  try {
    const result = await session.executeWrite(async tx => {
      const res = await tx.run(cypher, params);
      return res.records.map(record => {
        const obj = {};
        record.keys.forEach(key => {
          obj[key] = toNative(record.get(key));
        });
        return obj;
      });
    });
    return result;
  } finally {
    await session.close();
  }
}

// Health check function returning connectivity status, latency, and counts
async function checkHealth() {
  const configured = Boolean(password);
  if (!configured) {
    return {
      status: 'unconfigured',
      connected: false,
      uri,
      database,
      message: 'NEO4J_PASSWORD is not set in backend/.env. Graph operations will return fallback advice.'
    };
  }

  const start = Date.now();
  try {
    const drv = getDriver();
    if (!drv) throw new Error(lastError || 'Driver unavailable');
    await drv.verifyConnectivity();
    const records = await readQuery('RETURN 1 AS ping');
    const latencyMs = Date.now() - start;
    connectionVerified = true;
    lastError = null;

    // Fetch counts
    let nodeCount = 0;
    let relCount = 0;
    try {
      const countRes = await readQuery('MATCH (n) RETURN count(n) AS nodeCount');
      if (countRes.length > 0) nodeCount = countRes[0].nodeCount;
      const relRes = await readQuery('MATCH ()-[r]->() RETURN count(r) AS relCount');
      if (relRes.length > 0) relCount = relRes[0].relCount;
    } catch (_) {}

    return {
      status: 'connected',
      connected: true,
      latencyMs,
      uri,
      database,
      user,
      nodeCount,
      relCount,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    connectionVerified = false;
    lastError = err.message;
    return {
      status: 'disconnected',
      connected: false,
      uri,
      database,
      error: err.message,
      message: 'Failed to connect to Neo4j. Verify host, port, credentials, and network status.'
    };
  }
}

// Clean shutdown
async function closeDriver() {
  if (driver) {
    try {
      await driver.close();
      console.log('[NEO4J] Driver connection pool successfully terminated.');
    } catch (err) {
      console.error('[NEO4J] Error closing driver pool:', err.message);
    }
  }
}

process.on('SIGINT', async () => {
  await closeDriver();
});
process.on('SIGTERM', async () => {
  await closeDriver();
});

module.exports = {
  getDriver,
  readQuery,
  writeQuery,
  checkHealth,
  toNative,
  closeDriver,
  neo4j
};

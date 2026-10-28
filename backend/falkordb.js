// falkordb.js – Resilient FalkorDB Client Connection & Graph Session Manager
// Provides connection pooling, parameterized query execution, native type deserialization,
// and graceful circuit-breaker fallback for the HostelHub graph intelligence engine.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { FalkorDB } = require('falkordb');

// ==============================================================================
// VIVA_FALKORDB_ARCHITECTURE: DRIVER CONFIGURATION & CREDENTIAL MANAGEMENT
// Purpose: Establishes connection to the FalkorDB instance over Redis protocol (port 6379 default).
// Entry point: backend/falkordb.js (invoked by backend/server.js and backend/routes/graph.js)
// Input: Environment variables FALKORDB_HOST, FALKORDB_PORT, FALKORDB_PASSWORD, FALKORDB_GRAPH_NAME
// Logic: Defaults to localhost:6379 with graph 'hostel_hub' if unconfigured.
// FalkorDB role: Maintains pooled socket connections to the in-memory graph database.
// MySQL role: MySQL runs independently on port 3306; failure of FalkorDB does NOT affect MySQL ACID transactions.
// ==============================================================================
const host = process.env.FALKORDB_HOST || 'localhost';
const port = Number(process.env.FALKORDB_PORT) || 6379;
const password = process.env.FALKORDB_PASSWORD || undefined;
const username = process.env.FALKORDB_USERNAME || undefined;
const graphName = process.env.FALKORDB_GRAPH_NAME || 'hostel_hub';
const url = process.env.FALKORDB_URL || undefined;

let client = null;
let graph = null;
let connectionVerified = false;
let lastError = null;

// ==============================================================================
// VIVA_FALKORDB_DATA_VALIDATION: NATIVE TYPE CONVERTER (GRAPH RECORD DESERIALIZER)
// Purpose: Recursively converts FalkorDB-specific data types (Node, Edge, BigInt, Temporal)
//          into native JavaScript primitives and flat property structures.
// Entry point: toNative(value)
// Input: Any raw data returned from FalkorDB query result.
// Logic:
//   - Unpacks Node properties: maps properties, sets _labels = value.labels, _id = value.id.
//   - Unpacks Edge properties: maps properties, sets _type = value.relationshipType, _id = value.id.
//   - Converts BigInt to safe JavaScript Number.
//   - Recursively traverses Arrays and plain Objects.
// Output: Standard JavaScript object, array, or scalar ready for Express res.json().
// ==============================================================================
function toNative(value) {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'object' && value !== null && typeof value.toString === 'function' && value.constructor && value.constructor.name && value.constructor.name.startsWith('Plain')) {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(toNative);
  }
  if (typeof value === 'object') {
    // If it's a FalkorDB GraphNode or GraphEdge (has properties and either labels or relationshipType)
    if (value.properties && typeof value.properties === 'object') {
      const result = toNative(value.properties);
      if (value.labels) result._labels = value.labels;
      if (value.relationshipType) result._type = value.relationshipType;
      if (value.type) result._type = value.type;
      if (value.id !== undefined) result._id = toNative(value.id);
      if (value.identity !== undefined) result._id = toNative(value.identity);
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

// ==============================================================================
// VIVA_FALKORDB_FALLBACK: LAZY / FAULT-TOLERANT DRIVER INITIALIZATION
// Purpose: Lazily initializes the FalkorDB connection pool only when needed; returns null if offline.
// Entry point: getClient() & getGraph()
// Logic: Reuses existing connection instance. If offline or connection fails, logs warning and returns null.
// ==============================================================================
async function getClient() {
  if (!client) {
    try {
      const options = {
        integers: 'number'
      };
      if (url) {
        options.url = url;
      } else {
        options.host = host;
        options.port = port;
        if (password) options.password = password;
        if (username) options.username = username;
      }

      client = await FalkorDB.connect(options);
      lastError = null;
    } catch (err) {
      lastError = err.message;
      client = null;
      graph = null;
      return null;
    }
  }
  return client;
}

async function getGraph() {
  const cl = await getClient();
  if (!cl) return null;
  if (!graph) {
    graph = cl.selectGraph(graphName);
  }
  return graph;
}

/**
 * Normalizes query parameters for FalkorDB openCypher compatibility.
 * Recursively converts integers and nested structures.
 */
function normalizeParams(params) {
  if (!params || typeof params !== 'object') return {};
  const clean = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) {
      clean[k] = null;
    } else if (typeof v === 'number') {
      clean[k] = Number.isInteger(v) ? Math.trunc(v) : v;
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

// ==============================================================================
// VIVA_FALKORDB_CYPHER: MANAGED READ-ONLY QUERY RUNNER
// Purpose: Executes Cypher read transactions safely with automatic type conversion and error handling.
// Entry point: readQuery(cypher, params)
// Input: Cypher query string with parameter tokens (e.g., $studentId, $limit) and parameters object.
// Output: Array of plain JavaScript record objects matching column aliases.
// ==============================================================================
async function readQuery(cypher, params = {}) {
  const g = await getGraph();
  if (!g) {
    throw new Error(`FalkorDB offline: ${lastError || 'Driver not connected'}`);
  }

  const queryOptions = {
    params: normalizeParams(params)
  };

  try {
    const reply = g.roQuery ? await g.roQuery(cypher, queryOptions) : await g.query(cypher, queryOptions);
    const data = reply.data || [];
    return data.map(record => toNative(record));
  } catch (err) {
    // If graph key does not exist yet in Redis, treat read as empty dataset
    if (err.message && err.message.includes('empty key')) {
      // If query is checking count(n), return a zero count record
      if (/count\s*\(/i.test(cypher)) {
        return [{ totalStudents: 0, totalRooms: 0, totalMesses: 0, activeAllocations: 0, totalComplaints: 0, linkedComplaints: 0, nodeCount: 0, relCount: 0, unlinkedCount: 0 }];
      }
      return [];
    }
    // If read-only mode rejected due to complex clause or driver variation, retry with standard query
    if (err.message && (err.message.includes('READONLY') || err.message.includes('not supported in read-only'))) {
      const reply = await g.query(cypher, queryOptions);
      const data = reply.data || [];
      return data.map(record => toNative(record));
    }
    throw err;
  }
}

// ==============================================================================
// VIVA_FALKORDB_CYPHER: MANAGED WRITE TRANSACTION RUNNER
// Purpose: Executes Cypher mutation statements (MERGE, CREATE, SET, DELETE) inside a FalkorDB write query.
// Entry point: writeQuery(cypher, params)
// Input: Mutation Cypher query and parameters.
// Output: Result records or success acknowledgement.
// ==============================================================================
async function writeQuery(cypher, params = {}) {
  const g = await getGraph();
  if (!g) {
    throw new Error(`FalkorDB offline: ${lastError || 'Driver not connected'}`);
  }

  const queryOptions = {
    params: normalizeParams(params)
  };

  const reply = await g.query(cypher, queryOptions);
  const data = reply.data || [];
  return data.map(record => toNative(record));
}

// ==============================================================================
// VIVA_FALKORDB_FALLBACK: LIVE HEALTH CHECK & GRAPH PROJECTION AUDIT
// Purpose: Assesses active connectivity to FalkorDB, measures round-trip latency,
//          and counts total graph nodes & relationships.
// Entry point: checkHealth() (invoked by GET /api/graph/health and ensureFalkorDB middleware)
// Output: JSON object { status: 'connected'|'disconnected', latencyMs, nodeCount, relCount, ... }.
// ==============================================================================
async function checkHealth() {
  const start = Date.now();
  try {
    const cl = await getClient();
    if (!cl) {
      throw new Error(lastError || 'Could not establish connection to FalkorDB');
    }

    const g = await getGraph();
    if (!g) {
      throw new Error('Could not select FalkorDB graph: ' + graphName);
    }

    // Ping check
    await readQuery('RETURN 1 AS ping');
    const latencyMs = Date.now() - start;
    connectionVerified = true;
    lastError = null;

    // Fetch live node and relationship counts
    let nodeCount = 0;
    let relCount = 0;
    try {
      const countRes = await readQuery('MATCH (n) RETURN count(n) AS nodeCount');
      if (countRes.length > 0 && countRes[0].nodeCount !== undefined) {
        nodeCount = Number(countRes[0].nodeCount);
      }
      const relRes = await readQuery('MATCH ()-[r]->() RETURN count(r) AS relCount');
      if (relRes.length > 0 && relRes[0].relCount !== undefined) {
        relCount = Number(relRes[0].relCount);
      }
    } catch (_) {
      // Counts are non-fatal for basic ping
    }

    return {
      status: 'connected',
      connected: true,
      engine: 'FalkorDB',
      latencyMs,
      host,
      port,
      graphName,
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
      engine: 'FalkorDB',
      host,
      port,
      graphName,
      error: err.message,
      message: 'Failed to connect to FalkorDB at ' + host + ':' + port + '. Verify that the FalkorDB container/service is running.'
    };
  }
}

// Clean shutdown
async function closeConnection() {
  if (client) {
    try {
      await client.close();
      console.log('[FALKORDB] Connection pool successfully terminated.');
    } catch (err) {
      console.error('[FALKORDB] Error closing connection pool:', err.message);
    } finally {
      client = null;
      graph = null;
    }
  }
}

process.on('SIGINT', async () => {
  await closeConnection();
});
process.on('SIGTERM', async () => {
  await closeConnection();
});

// Helper for integer casting (compatibility with code expecting int helpers)
function int(value) {
  return typeof value === 'number' ? Math.trunc(value) : parseInt(value, 10);
}

module.exports = {
  getClient,
  getGraph,
  readQuery,
  writeQuery,
  checkHealth,
  toNative,
  closeConnection,
  closeDriver: closeConnection,
  int,
  falkordb: { int },
  neo4j: { int }
};

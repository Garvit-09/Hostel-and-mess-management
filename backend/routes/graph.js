// routes/graph.js – FalkorDB Graph Intelligence REST API
// Implements Roommates, Grievance Hotspots, Smart Vacancy, Mess Connections, and Interactive Explorer
const express = require('express');
const router = express.Router();
const pool = require('../db');
const falkor = require('../falkordb');
const neo = falkor; // Maintain 'neo' alias for seamless internal Cypher runner compatibility
const { syncDatabaseToGraph, fetchSourceData } = require('../scripts/sync-falkordb');
const { getNodeGraphId, getEdgeGraphId, validateGraphPayload } = require('../graph-utils');

// ==============================================================================
// VIVA_FALKORDB_ARCHITECTURE: CONNECTION VERIFICATION & CIRCUIT BREAKER MIDDLEWARE
// VIVA_FALKORDB_FALLBACK: AUTOMATIC ROUTING BETWEEN CYPHER AND RELATIONAL LOGIC
// Purpose: Inspects FalkorDB health before processing any /api/graph/* request, populating req.graphConnected.
// Entry point: ensureFalkorDB middleware (applied via router.use)
// Input: Incoming Express HTTP request.
// Logic: Invokes falkor.checkHealth(). If FalkorDB is offline or credentials missing, attaches req.graphConnected = false without halting request execution. Downstream route handlers inspect req.graphConnected to choose between live Cypher or relational fallback.
// FalkorDB role: Prevents hanging socket requests if the graph database is temporarily unavailable.
// MySQL role: Guarantees zero downtime by allowing routes to serve authoritative relational projections.
// Output: Sets req.graphConnected (boolean) and req.graphHealth (object), with req.neo4jConnected alias for backward compatibility.
// ==============================================================================
async function ensureFalkorDB(req, res, next) {
  try {
    const health = await falkor.checkHealth();
    if (!health.connected) {
      req.graphConnected = false;
      req.neo4jConnected = false;
      req.graphError = health.message || health.error;
      req.neo4jError = health.message || health.error;
    } else {
      req.graphConnected = true;
      req.neo4jConnected = true;
      req.graphHealth = health;
      req.neo4jHealth = health;
    }
  } catch (err) {
    req.graphConnected = false;
    req.neo4jConnected = false;
    req.graphError = err.message;
    req.neo4jError = err.message;
  }
  next();
}

router.use(ensureFalkorDB);

// ==============================================================================
// 1. HEALTH & METRICS
// ==============================================================================

// ==============================================================================
// VIVA_FALKORDB_OVERVIEW: DUAL-ENGINE HEALTH STATUS
// VIVA_FALKORDB_API: GET /api/graph/health
// Purpose: Reports live operational status, latency, and counts for both MySQL and FalkorDB.
// Entry point: GET /api/graph/health
// Input: None
// Logic: Queries FalkorDB client health and MySQL connection status; returns unified JSON.
// Output: JSON object with falkordb connectivity status, latencyMs, nodeCount, relCount, and MySQL engine status.
// ==============================================================================
router.get('/health', async (req, res) => {
  const health = await falkor.checkHealth();
  const dbStatus = pool.getEngineStatus ? pool.getEngineStatus() : { engineName: 'MySQL 8.0' };
  res.json({
    falkordb: health,
    neo4j: health, // Backwards-compatible alias for existing frontend health checks
    mysql: {
      status: 'online',
      engine: dbStatus.engineName,
      isFallback: dbStatus.isFallback
    },
    hybridArchitecture: 'Active (MySQL Primary Transactional + FalkorDB Graph Intelligence)'
  });
});

// ==============================================================================
// VIVA_NEO4J_OVERVIEW: GRAPH INTELLIGENCE KPIS & METRICS ROLLUP
// VIVA_NEO4J_CYPHER: MULTI-MATCH PIPELINE WITH WITH ... AS PIPELINING
// VIVA_NEO4J_API: GET /api/graph/overview
// Purpose: Computes high-level counts: total students, rooms, messes, active allocations, and linked vs unlinked grievances.
// Entry point: GET /api/graph/overview
// Input: None
// Logic:
//   - If Neo4j offline: Computes rollups using fetchSourceData() from MySQL in memory.
//   - If Neo4j online: Executes a single Cypher query with OPTIONAL MATCH statements piped via WITH.
// Cypher explanation:
//   - OPTIONAL MATCH (s:Student) WITH count(s) AS totalStudents: Counts students without failing if none exist.
//   - OPTIONAL MATCH (r:Room) WITH totalStudents, count(r) AS totalRooms: Pipes totalStudents and counts rooms.
//   - OPTIONAL MATCH (:Student)-[a:ALLOCATED_TO {status: 'Active'}]->(:Room): Counts active room allocations.
//   - OPTIONAL MATCH (lc:Complaint)-[:ASSOCIATED_WITH]->(): Counts distinct complaints that have facility links.
//   - RETURN aggregates all metrics in a single network round-trip.
// Demonstration search: VIVA_NEO4J_OVERVIEW
// ==============================================================================
router.get('/overview', async (req, res) => {
  if (!req.neo4jConnected) {
    // Provide simulated overview based on authoritative database engine
    const src = await fetchSourceData();
    const activeAlloc = src.roomAllocations.filter(a => a.status === 'Active');
    const linkedComps = src.complaints.filter(c => c.room_id || c.mess_id || c.hostel_id);
    return res.json({
      neo4jConnected: false,
      notice: 'Neo4j offline. Displaying authoritative relational projection.',
      totalStudents: src.students.length,
      totalRooms: src.rooms.length,
      totalMesses: src.messes.length,
      activeAllocations: activeAlloc.length,
      totalComplaints: src.complaints.length,
      linkedComplaints: linkedComps.length,
      unlinkedComplaints: src.complaints.length - linkedComps.length
    });
  }

  try {
    const [counts] = await neo.readQuery(`
      OPTIONAL MATCH (s:Student) WITH count(s) AS totalStudents
      OPTIONAL MATCH (r:Room) WITH totalStudents, count(r) AS totalRooms
      OPTIONAL MATCH (m:Mess) WITH totalStudents, totalRooms, count(m) AS totalMesses
      OPTIONAL MATCH (:Student)-[a:ALLOCATED_TO {status: 'Active'}]->(:Room) WITH totalStudents, totalRooms, totalMesses, count(a) AS activeAllocations
      OPTIONAL MATCH (c:Complaint) WITH totalStudents, totalRooms, totalMesses, activeAllocations, count(c) AS totalComplaints
      OPTIONAL MATCH (lc:Complaint)-[:ASSOCIATED_WITH]->() WITH totalStudents, totalRooms, totalMesses, activeAllocations, totalComplaints, count(DISTINCT lc) AS linkedComplaints
      RETURN totalStudents, totalRooms, totalMesses, activeAllocations, totalComplaints, linkedComplaints
    `);

    res.json({
      neo4jConnected: true,
      totalStudents: counts?.totalStudents || 0,
      totalRooms: counts?.totalRooms || 0,
      totalMesses: counts?.totalMesses || 0,
      activeAllocations: counts?.activeAllocations || 0,
      totalComplaints: counts?.totalComplaints || 0,
      linkedComplaints: counts?.linkedComplaints || 0,
      unlinkedComplaints: Math.max(0, (counts?.totalComplaints || 0) - (counts?.linkedComplaints || 0))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==============================================================================
// 2. FEATURE 1: ROOMMATE RELATIONSHIP EXPLORER
// ==============================================================================

// ==============================================================================
// VIVA_ROOMMATE_FINDER: ACTIVE ROOMMATE DISCOVERY & RELATIONSHIP TRAVERSAL
// VIVA_NEO4J_API: GET /api/graph/students/:studentId/roommates
// VIVA_NEO4J_CYPHER: PEER DISCOVERY VIA ALLOCATED_TO STATUS: 'ACTIVE'
// VIVA_NEO4J_FALLBACK: IN-MEMORY RELATIONAL ALLOCATION JOIN FALLBACK
// VIVA_NEO4J_LIMITATIONS: LOOKUP VS RECOMMENDATION & GENDER SAFEGUARD BOUNDARY
// Purpose: Retrieves the target student's current active room allocation, hostel hierarchy (Floor -> Block -> Hostel), and all peer students actively sharing the same room.
// Entry point: GET /api/graph/students/:studentId/roommates
// Input: :studentId path parameter (validated with Number() and isNaN() check; rejects non-numeric input with HTTP 400).
// Logic:
//   1. Validates student existence in MySQL/authoritative source (returns 404 if not found).
//   2. If Neo4j is offline: Traverses roomAllocations in JS, finds allocation with status = 'Active', and filters other students with active allocations for the same room_id.
//   3. If Neo4j is online: Runs Cypher pattern match.
// Cypher explanation:
//   - MATCH (s:Student {student_id: $studentId}): Binds the target student node.
//   - OPTIONAL MATCH (s)-[a1:ALLOCATED_TO {status: 'Active'}]->(r:Room): Traverses to the student's currently occupied room.
//   - OPTIONAL MATCH (roommate:Student)-[a2:ALLOCATED_TO {status: 'Active'}]->(r): Traverses incoming active allocation edges to the same room.
//   - WHERE roommate.student_id <> s.student_id: Prevents the student from appearing as their own roommate.
//   - OPTIONAL MATCH (r)-[:ON_FLOOR]->(fl)-[:IN_BLOCK]->(b)-[:PART_OF]->(h) & (r)-[:HAS_TYPE]->(rt): Traverses spatial and category hierarchy.
//   - collect(DISTINCT {...}) AS rawRoommates: Aggregates peer roommate objects into a clean array in a single query.
// Current roommates vs Suggestions:
//   This feature strictly returns CURRENT actively allocated roommates sharing the exact room. It does NOT suggest or predict potential roommates.
// Gender and eligibility safeguards:
//   CRITICAL LIMITATION: Gender compatibility and hostel block eligibility are NOT checked or enforced in this Cypher query.
//   The query assumes allocations present in the graph were already validated when inserted by MySQL. Roommate lookup is decoupled from allocation validation.
// Output: JSON object containing student details, hasActiveAllocation flag, room metadata (room_number, hostel_name, capacity, ac_type), roommateCount, and roommates array.
// Viva explanation: "The Roommate Finder demonstrates index-free adjacency. Instead of performing a 6-table relational join in MySQL, Cypher matches the target Student node, hops across the [:ALLOCATED_TO {status: 'Active'}] edge to the Room node, and finds all other incoming active allocation edges. It excludes the student themselves using WHERE roommate.student_id <> s.student_id. Note that this feature inspects existing living assignments—it does not recommend future roommates, and gender rules are enforced at allocation time in MySQL, not in this read query."
// Demonstration search: VIVA_ROOMMATE_FINDER
// ==============================================================================
router.get('/students/:studentId/roommates', async (req, res) => {
  const studentId = Number(req.params.studentId);
  if (isNaN(studentId)) {
    return res.status(400).json({ error: 'Valid numeric studentId is required.' });
  }

  // 1. Authoritative check in MySQL/Fallback first
  let studentName = '';
  let studentRegNo = '';
  try {
    const src = await fetchSourceData();
    const st = src.students.find(s => s.student_id === studentId);
    if (!st) {
      return res.status(404).json({ error: `Student with ID ${studentId} not found in database.` });
    }
    studentName = st.full_name;
    studentRegNo = st.reg_no;
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  // If Neo4j is offline, provide graceful relational computation
  if (!req.neo4jConnected) {
    const src = await fetchSourceData();
    const activeAlloc = src.roomAllocations.find(a => a.student_id === studentId && a.status === 'Active');
    if (!activeAlloc) {
      return res.json({
        neo4jConnected: false,
        student: { student_id: studentId, full_name: studentName, reg_no: studentRegNo },
        hasActiveAllocation: false,
        message: `${studentName} does not currently have an active room allocation.`,
        roommates: []
      });
    }

    const room = src.rooms.find(r => r.room_id === activeAlloc.room_id) || {};
    const fl = src.floors.find(f => f.floor_id === room.floor_id) || {};
    const bl = src.blocks.find(b => b.block_id === fl.block_id) || {};
    const hs = src.hostels.find(h => h.hostel_id === bl.hostel_id) || {};
    const rt = src.roomTypes.find(t => t.room_type_id === room.room_type_id) || {};

    const roommateAllocs = src.roomAllocations.filter(a => a.room_id === room.room_id && a.status === 'Active' && a.student_id !== studentId);
    const roommates = roommateAllocs.map(ra => {
      const rmSt = src.students.find(s => s.student_id === ra.student_id) || {};
      return {
        student_id: rmSt.student_id,
        reg_no: rmSt.reg_no,
        full_name: rmSt.full_name,
        branch: rmSt.branch,
        course: rmSt.course,
        year_of_study: rmSt.year_of_study,
        allocation_date: ra.allocation_date
      };
    });

    return res.json({
      neo4jConnected: false,
      notice: 'Computed via authoritative relational engine (Neo4j offline).',
      student: { student_id: studentId, full_name: studentName, reg_no: studentRegNo },
      hasActiveAllocation: true,
      room: {
        room_id: room.room_id,
        room_number: room.room_number,
        hostel_name: hs.hostel_name,
        hostel_type: hs.hostel_type,
        block_name: bl.block_name,
        floor_number: fl.floor_number,
        capacity: rt.capacity,
        ac_type: rt.ac_type
      },
      roommateCount: roommates.length,
      roommates
    });
  }

  // Live Cypher Graph Query
  try {
    const cypher = `
      MATCH (s:Student {student_id: $studentId})
      OPTIONAL MATCH (s)-[a1:ALLOCATED_TO {status: 'Active'}]->(r:Room)
      OPTIONAL MATCH (roommate:Student)-[a2:ALLOCATED_TO {status: 'Active'}]->(r)
      WHERE roommate.student_id <> s.student_id
      OPTIONAL MATCH (r)-[:ON_FLOOR]->(fl:Floor)-[:IN_BLOCK]->(b:Block)-[:PART_OF]->(h:Hostel)
      OPTIONAL MATCH (r)-[:HAS_TYPE]->(rt:RoomType)
      RETURN s, r, fl, b, h, rt,
             collect(DISTINCT {
               student_id: roommate.student_id,
               reg_no: roommate.reg_no,
               full_name: roommate.full_name,
               branch: roommate.branch,
               course: roommate.course,
               year_of_study: roommate.year_of_study,
               allocation_date: a2.allocation_date
             }) AS rawRoommates
    `;

    const records = await neo.readQuery(cypher, { studentId });
    if (!records || records.length === 0) {
      return res.status(404).json({ error: `Student with ID ${studentId} not found in Neo4j graph.` });
    }

    const row = records[0];
    const s = row.s || {};
    const r = row.r;

    if (!r || !r.room_id) {
      return res.json({
        neo4jConnected: true,
        student: { student_id: s.student_id, full_name: s.full_name, reg_no: s.reg_no },
        hasActiveAllocation: false,
        message: `${s.full_name} does not currently have an active room allocation.`,
        roommates: []
      });
    }

    // Filter out null objects collected by Cypher when no roommates exist
    const roommates = (row.rawRoommates || []).filter(rm => rm && rm.student_id);

    res.json({
      neo4jConnected: true,
      student: {
        student_id: s.student_id,
        full_name: s.full_name,
        reg_no: s.reg_no,
        branch: s.branch
      },
      hasActiveAllocation: true,
      room: {
        room_id: r.room_id,
        room_number: r.room_number,
        hostel_name: row.h?.hostel_name || 'N/A',
        hostel_type: row.h?.hostel_type || 'N/A',
        block_name: row.b?.block_name || 'N/A',
        floor_number: row.fl?.floor_number ?? 'N/A',
        capacity: row.rt?.capacity || 'N/A',
        ac_type: row.rt?.ac_type || 'N/A'
      },
      roommateCount: roommates.length,
      roommates
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==============================================================================
// VIVA_ROOMMATE_FINDER: TEMPORAL HOUSING HISTORY & OVERLAPPING ROOMMATE INTERVALS
// VIVA_NEO4J_CYPHER: DATE RANGE OVERLAP CLAUSE (ALLOCATION_DATE & VACATE_DATE)
// VIVA_NEO4J_API: GET /api/graph/students/:studentId/history
// Purpose: Analyzes past room allocations across academic years and identifies peer students who resided in the same room during overlapping date ranges.
// Entry point: GET /api/graph/students/:studentId/history
// Input: :studentId (validated numeric ID).
// Logic:
//   - If Neo4j offline: Iterates student roomAllocations and filters peer allocations sharing room_id where allocStart <= peerEnd and peerStart <= allocEnd.
//   - If Neo4j online: Traverses ALLOCATED_TO edges without active filter, joining peers on room_id and checking date overlap.
// Cypher explanation:
//   - MATCH (s:Student)-[a1:ALLOCATED_TO]->(r:Room): Matches all allocations (both Active and Vacated).
//   - MATCH (pastRoommate:Student)-[a2:ALLOCATED_TO]->(r): Matches peers in the same room.
//   - WHERE pastRoommate.student_id <> s.student_id: Excludes self.
//   - AND (a1.allocation_date <= coalesce(a2.vacate_date, '9999-12-31'))
//     AND (a2.allocation_date <= coalesce(a1.vacate_date, '9999-12-31')):
//     Mathematical condition for two time intervals [S1, E1] and [S2, E2] overlapping (S1 <= E2 AND S2 <= E1). Coalesce handles active residents whose vacate_date is NULL.
// Demonstration search: VIVA_ROOMMATE_FINDER
// ==============================================================================
router.get('/students/:studentId/history', async (req, res) => {
  const studentId = Number(req.params.studentId);
  if (isNaN(studentId)) {
    return res.status(400).json({ error: 'Valid numeric studentId is required.' });
  }

  if (!req.neo4jConnected) {
    // Relational fallback for historical analysis
    const src = await fetchSourceData();
    const studentAllocs = src.roomAllocations.filter(a => a.student_id === studentId);
    const history = [];

    for (const alloc of studentAllocs) {
      const room = src.rooms.find(r => r.room_id === alloc.room_id) || {};
      const fl = src.floors.find(f => f.floor_id === room.floor_id) || {};
      const bl = src.blocks.find(b => b.block_id === fl.block_id) || {};
      const hs = src.hostels.find(h => h.hostel_id === bl.hostel_id) || {};

      // Overlapping peer allocations in same room
      const allocStart = alloc.allocation_date;
      const allocEnd = alloc.vacate_date || '9999-12-31';

      const peers = src.roomAllocations.filter(a => {
        if (a.room_id !== alloc.room_id || a.student_id === studentId) return false;
        const pStart = a.allocation_date;
        const pEnd = a.vacate_date || '9999-12-31';
        return allocStart <= pEnd && pStart <= allocEnd;
      }).map(pa => {
        const pSt = src.students.find(s => s.student_id === pa.student_id) || {};
        return {
          student_id: pSt.student_id,
          reg_no: pSt.reg_no,
          full_name: pSt.full_name,
          allocation_date: pa.allocation_date,
          vacate_date: pa.vacate_date,
          status: pa.status
        };
      });

      history.push({
        allocation_id: alloc.allocation_id,
        room_number: room.room_number,
        hostel_name: hs.hostel_name,
        block_name: bl.block_name,
        status: alloc.status,
        allocation_date: alloc.allocation_date,
        vacate_date: alloc.vacate_date,
        roommates: peers
      });
    }

    return res.json({
      neo4jConnected: false,
      history
    });
  }

  try {
    const cypher = `
      MATCH (s:Student {student_id: $studentId})-[a1:ALLOCATED_TO]->(r:Room)
      OPTIONAL MATCH (r)-[:ON_FLOOR]->(fl:Floor)-[:IN_BLOCK]->(b:Block)-[:PART_OF]->(h:Hostel)
      OPTIONAL MATCH (pastRoommate:Student)-[a2:ALLOCATED_TO]->(r)
      WHERE pastRoommate.student_id <> s.student_id
        AND (a1.allocation_date <= coalesce(a2.vacate_date, '9999-12-31'))
        AND (a2.allocation_date <= coalesce(a1.vacate_date, '9999-12-31'))
      RETURN a1.allocation_id AS allocation_id,
             r.room_number AS room_number,
             h.hostel_name AS hostel_name,
             b.block_name AS block_name,
             a1.status AS status,
             a1.allocation_date AS allocation_date,
             a1.vacate_date AS vacate_date,
             collect(DISTINCT {
               student_id: pastRoommate.student_id,
               reg_no: pastRoommate.reg_no,
               full_name: pastRoommate.full_name,
               allocation_date: a2.allocation_date,
               vacate_date: a2.vacate_date,
               status: a2.status
             }) AS roommates
      ORDER BY a1.allocation_date DESC
    `;

    const records = await neo.readQuery(cypher, { studentId });
    const history = records.map(rec => ({
      allocation_id: rec.allocation_id,
      room_number: rec.room_number,
      hostel_name: rec.hostel_name,
      block_name: rec.block_name,
      status: rec.status,
      allocation_date: rec.allocation_date,
      vacate_date: rec.vacate_date,
      roommates: (rec.roommates || []).filter(rm => rm && rm.student_id)
    }));

    res.json({
      neo4jConnected: true,
      history
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==============================================================================
// VIVA_ROOMMATE_FINDER: DEDICATED CYTOSCAPE GRAPH PAYLOAD FOR ROOMMATES
// VIVA_NEO4J_FRONTEND: CLIENT-SIDE SUBGRAPH CONSTRUCTION
// VIVA_NEO4J_API: GET /api/graph/students/:studentId/roommates-graph
// Purpose: Constructs a focused Cytoscape graph payload containing the student, their active roommates, room, floor, block, and hostel hierarchy.
// Entry point: GET /api/graph/students/:studentId/roommates-graph
// Input: :studentId
// Logic:
//   1. Retrieves authoritative student and active room allocation.
//   2. Adds nodes for Student, Room, Floor, Block, and Hostel using canonical IDs (e.g. 'student_1', 'room_1').
//   3. Adds edges: ALLOCATED_TO, ON_FLOOR, IN_BLOCK, PART_OF.
//   4. Runs validateGraphPayload() to guarantee 100% endpoint integrity before returning JSON.
// Output: JSON elements { nodes, edges } ready for Cytoscape.js canvas mounting.
// Demonstration search: VIVA_ROOMMATE_FINDER
// ==============================================================================
router.get('/students/:studentId/roommates-graph', async (req, res) => {
  const studentId = Number(req.params.studentId);
  if (isNaN(studentId)) {
    return res.status(400).json({ error: 'Valid numeric studentId is required.' });
  }

  const rawNodes = [];
  const rawEdges = [];
  const addedNodes = new Set();

  function addNode(type, id, label, extra = {}) {
    const graphId = getNodeGraphId(type, id);
    if (!graphId || addedNodes.has(graphId)) return graphId;
    addedNodes.add(graphId);
    rawNodes.push({
      data: {
        id: graphId,
        label: String(label || graphId),
        type,
        ...extra
      }
    });
    return graphId;
  }

  function addEdge(sourceId, targetId, relType, extra = {}) {
    if (!sourceId || !targetId || !relType) return null;
    const edgeId = getEdgeGraphId(sourceId, relType, targetId);
    rawEdges.push({
      data: {
        id: edgeId,
        source: sourceId,
        target: targetId,
        label: relType,
        ...extra
      }
    });
    return edgeId;
  }

  try {
    const src = await fetchSourceData();
    const st = (src.students || []).find(s => s.student_id === studentId);
    if (!st) {
      return res.status(404).json({ error: `Student with ID ${studentId} not found.` });
    }

    // 1. Always add target student
    const studentGraphId = addNode('Student', st.student_id, st.full_name, {
      student_id: st.student_id,
      reg_no: st.reg_no,
      branch: st.branch,
      course: st.course,
      year: st.year_of_study,
      role: 'selected',
      isSelected: true
    });

    // 2. Look up active allocation
    const activeAlloc = (src.roomAllocations || []).find(a => a.student_id === studentId && a.status === 'Active');
    if (!activeAlloc || !activeAlloc.room_id) {
      const validated = validateGraphPayload(rawNodes, rawEdges);
      return res.json({
        hasActiveAllocation: false,
        message: `${st.full_name} has no active room allocation.`,
        elements: { nodes: validated.nodes, edges: validated.edges }
      });
    }

    const room = (src.rooms || []).find(r => r.room_id === activeAlloc.room_id) || {};
    const fl = (src.floors || []).find(f => f.floor_id === room.floor_id) || {};
    const bl = (src.blocks || []).find(b => b.block_id === fl.block_id) || {};
    const hs = (src.hostels || []).find(h => h.hostel_id === bl.hostel_id) || {};
    const rt = (src.roomTypes || []).find(t => t.room_type_id === room.room_type_id) || {};

    const roomGraphId = addNode('Room', room.room_id, `Room ${room.room_number}`, {
      room_id: room.room_id,
      room_number: room.room_number,
      capacity: rt.capacity || 2,
      ac_type: rt.ac_type || 'Non-AC'
    });

    addEdge(studentGraphId, roomGraphId, 'ALLOCATED_TO', { allocation_date: activeAlloc.allocation_date });

    // 3. Find active roommates in same room
    const peerAllocs = (src.roomAllocations || []).filter(a => a.room_id === room.room_id && a.status === 'Active' && a.student_id !== studentId);
    peerAllocs.forEach(pa => {
      const peer = (src.students || []).find(s => s.student_id === pa.student_id);
      if (peer) {
        const peerGraphId = addNode('Student', peer.student_id, peer.full_name, {
          student_id: peer.student_id,
          reg_no: peer.reg_no,
          branch: peer.branch,
          course: peer.course,
          year: peer.year_of_study,
          role: 'roommate',
          isRoommate: true,
          allocation_date: pa.allocation_date
        });
        addEdge(peerGraphId, roomGraphId, 'ALLOCATED_TO', { allocation_date: pa.allocation_date });
      }
    });

    // 4. Floor, Block, Hostel Hierarchy
    let parentGraphId = roomGraphId;
    if (fl.floor_id) {
      const floorGraphId = addNode('Floor', fl.floor_id, `Floor ${fl.floor_number}`, {
        floor_id: fl.floor_id,
        floor_number: fl.floor_number
      });
      addEdge(roomGraphId, floorGraphId, 'ON_FLOOR');
      parentGraphId = floorGraphId;
    }

    if (bl.block_id) {
      const blockGraphId = addNode('Block', bl.block_id, bl.block_name, {
        block_id: bl.block_id,
        block_name: bl.block_name
      });
      addEdge(parentGraphId, blockGraphId, 'IN_BLOCK');
      parentGraphId = blockGraphId;
    }

    if (hs.hostel_id) {
      const hostelGraphId = addNode('Hostel', hs.hostel_id, hs.hostel_name, {
        hostel_id: hs.hostel_id,
        hostel_name: hs.hostel_name,
        hostel_type: hs.hostel_type
      });
      addEdge(parentGraphId, hostelGraphId, 'PART_OF');
    }

    const validated = validateGraphPayload(rawNodes, rawEdges);
    res.json({
      hasActiveAllocation: true,
      roommateCount: peerAllocs.length,
      elements: {
        nodes: validated.nodes,
        edges: validated.edges
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==============================================================================
// 3. FEATURE 2: COMPLAINT HOTSPOT DETECTION
// ==============================================================================

// ==============================================================================
// VIVA_GRIEVANCE_HOTSPOT: SPATIAL GRIEVANCE CLUSTERING & FACILITY HOTSPOT RANKINGS
// VIVA_NEO4J_API: GET /api/graph/complaint-hotspots
// VIVA_NEO4J_CYPHER: GRAPH-BASED FACILITY GROUPING & CONDITIONAL COUNT AGGREGATION
// VIVA_NEO4J_FALLBACK: IN-MEMORY FACILITY AGGREGATION FALLBACK
// VIVA_NEO4J_LIMITATIONS: SPATIAL CO-OCCURRENCE VS ROOT CAUSATION
// Purpose: Aggregates student grievances by facility (Room, Mess, Hostel) to identify infrastructure bottlenecks requiring maintenance inspection.
// Entry point: GET /api/graph/complaint-hotspots
// Input query parameters:
//   - category: 'All', 'Hostel', or 'Mess' (filters by ComplaintType.category).
//   - status: 'All', 'Open' (matches Pending or In Progress), 'Pending', 'In Progress', or 'Resolved'.
//   - limit: Numeric max items to return (clamped between 1 and 50, default 10).
// Logic:
//   - If Neo4j offline: Iterates complaints from fetchSourceData(), groups by facility key (Room_id, Mess_id, Hostel_id), tallies open vs resolved counts, and sorts by openComplaints DESC.
//   - If Neo4j online: Executes Cypher graph aggregation.
// Cypher explanation:
//   - MATCH (c:Complaint)-[:ASSOCIATED_WITH]->(fac): Traverses to the linked facility node.
//   - MATCH (c)-[:OF_TYPE]->(ct:ComplaintType): Matches category and type taxonomy.
//   - WHERE ($category = 'All' OR ct.category = $category) AND status filters: Filters complaints dynamically based on parameters.
//   - WITH fac, labels(fac) AS lbls, count(DISTINCT c) AS totalComplaints,
//          count(DISTINCT CASE WHEN c.status IN ['Pending', 'In Progress'] THEN c END) AS openComplaints,
//          count(DISTINCT CASE WHEN c.status = 'Resolved' THEN c END) AS resolvedComplaints:
//          Performs conditional SQL-style SUM(CASE...) aggregations natively in Cypher.
//   - OPTIONAL MATCH (fac)-[:ON_FLOOR]->... & (fac)-[:LOCATED_AT]->(mh:Hostel): Resolves human-readable parent hostel names.
//   - ORDER BY openComplaints DESC, totalComplaints DESC: Ranks facilities with the highest volume of active unresolved issues first.
//   - Unlinked complaints: Counted in a separate query WHERE NOT (c)-[:ASSOCIATED_WITH]->() to ensure campus-wide complaints are transparently tracked.
// Direct Neo4j vs Fallback:
//   In live mode, hotspot metrics are aggregated entirely in Neo4j via Cypher count(DISTINCT ...).
//   In fallback mode, aggregation is computed in JavaScript using Map objects.
// Causation warning:
//   CRITICAL DISTINCTION: A high complaint count indicates recurring incident reports at a facility. It does NOT prove that the facility or its staff caused the defect—it highlights areas for priority inspection.
// Output: JSON { neo4jConnected, unlinkedComplaintsCount, hotspots: [{ facility_type, facility_id, facility_name, hostel_name, totalComplaints, openComplaints, resolvedComplaints, complaints }] }.
// Viva explanation: "Grievance Hotspot Detection aggregates complaints across the [:ASSOCIATED_WITH] relationship. Cypher groups grievances by facility node and computes open versus resolved complaints in parallel. Facilities are ranked by open complaints descending so administrators can instantly see which rooms or dining halls need maintenance. Note that a high complaint count represents a reported problem cluster, not proof of contractor liability."
// Demonstration search: VIVA_GRIEVANCE_HOTSPOT
// ==============================================================================
router.get('/complaint-hotspots', async (req, res) => {
  const category = req.query.category || 'All'; // All, Hostel, Mess
  const status = req.query.status || 'All'; // All, Open, Pending, In Progress, Resolved
  const limit = Math.min(Number(req.query.limit) || 10, 50);

  if (!req.neo4jConnected) {
    // Relational calculation of hotspots
    const src = await fetchSourceData();
    const filteredComplaints = src.complaints.filter(c => {
      const ct = src.complaintTypes.find(t => t.complaint_type_id === c.complaint_type_id) || {};
      if (category !== 'All' && ct.category !== category) return false;
      if (status === 'Open' && c.status === 'Resolved') return false;
      if (status !== 'All' && status !== 'Open' && c.status !== status) return false;
      return true;
    });

    const unlinkedCount = filteredComplaints.filter(c => !c.room_id && !c.mess_id && !c.hostel_id).length;
    const facilityMap = new Map();

    for (const c of filteredComplaints) {
      let key = null;
      let facType = '';
      let facName = '';
      let hostelName = '';

      if (c.room_id) {
        key = `Room_${c.room_id}`;
        facType = 'Room';
        const rm = src.rooms.find(r => r.room_id === c.room_id) || {};
        const fl = src.floors.find(f => f.floor_id === rm.floor_id) || {};
        const bl = src.blocks.find(b => b.block_id === fl.block_id) || {};
        const hs = src.hostels.find(h => h.hostel_id === bl.hostel_id) || {};
        facName = `Room ${rm.room_number}`;
        hostelName = hs.hostel_name || 'Campus';
      } else if (c.mess_id) {
        key = `Mess_${c.mess_id}`;
        facType = 'Mess';
        const ms = src.messes.find(m => m.mess_id === c.mess_id) || {};
        const hs = src.hostels.find(h => h.hostel_id === ms.hostel_id) || {};
        facName = ms.mess_name;
        hostelName = hs.hostel_name || 'Campus Dining';
      } else if (c.hostel_id) {
        key = `Hostel_${c.hostel_id}`;
        facType = 'Hostel';
        const hs = src.hostels.find(h => h.hostel_id === c.hostel_id) || {};
        facName = hs.hostel_name;
        hostelName = hs.hostel_name;
      }

      if (key) {
        if (!facilityMap.has(key)) {
          facilityMap.set(key, {
            facility_type: facType,
            facility_id: c.room_id || c.mess_id || c.hostel_id,
            facility_name: facName,
            hostel_name: hostelName,
            totalComplaints: 0,
            openComplaints: 0,
            resolvedComplaints: 0,
            complaints: []
          });
        }
        const item = facilityMap.get(key);
        item.totalComplaints++;
        if (c.status === 'Resolved') item.resolvedComplaints++;
        else item.openComplaints++;
        const ct = src.complaintTypes.find(t => t.complaint_type_id === c.complaint_type_id) || {};
        item.complaints.push({
          complaint_id: c.complaint_id,
          description: c.description,
          status: c.status,
          complaint_date: c.complaint_date,
          type_name: ct.type_name,
          category: ct.category
        });
      }
    }

    const hotspots = Array.from(facilityMap.values())
      .sort((a, b) => b.openComplaints - a.openComplaints || b.totalComplaints - a.totalComplaints)
      .slice(0, limit);

    return res.json({
      neo4jConnected: false,
      notice: 'Computed via relational engine (Neo4j offline).',
      unlinkedComplaintsCount: unlinkedCount,
      hotspots
    });
  }

  // Live Cypher Graph Query
  try {
    const cypher = `
      MATCH (c:Complaint)-[:ASSOCIATED_WITH]->(fac)
      MATCH (c)-[:OF_TYPE]->(ct:ComplaintType)
      WHERE ($category = 'All' OR ct.category = $category)
        AND (
          $status = 'All'
          OR ($status = 'Open' AND c.status IN ['Pending', 'In Progress'])
          OR c.status = $status
        )
      WITH fac, labels(fac) AS lbls,
           count(DISTINCT c) AS totalComplaints,
           count(DISTINCT CASE WHEN c.status IN ['Pending', 'In Progress'] THEN c END) AS openComplaints,
           count(DISTINCT CASE WHEN c.status = 'Resolved' THEN c END) AS resolvedComplaints,
           collect(DISTINCT {
             complaint_id: c.complaint_id,
             description: c.description,
             status: c.status,
             complaint_date: c.complaint_date,
             type_name: ct.type_name,
             category: ct.category
           }) AS complaints
      OPTIONAL MATCH (fac)-[:ON_FLOOR]->(fl:Floor)-[:IN_BLOCK]->(b:Block)-[:PART_OF]->(h:Hostel)
      OPTIONAL MATCH (fac)-[:LOCATED_AT]->(mh:Hostel)
      RETURN lbls[0] AS facility_type,
             coalesce(fac.room_number, fac.mess_name, fac.hostel_name) AS raw_name,
             coalesce(fac.room_id, fac.mess_id, fac.hostel_id) AS facility_id,
             coalesce(h.hostel_name, mh.hostel_name, fac.hostel_name, 'Campus') AS hostel_name,
             totalComplaints,
             openComplaints,
             resolvedComplaints,
             complaints
      ORDER BY openComplaints DESC, totalComplaints DESC
      LIMIT $limit
    `;

    const records = await neo.readQuery(cypher, { category, status, limit: neo.neo4j.int(limit) });

    // Unlinked complaints count in graph
    const unlinkedRecords = await neo.readQuery(`
      MATCH (c:Complaint)
      WHERE NOT (c)-[:ASSOCIATED_WITH]->()
      RETURN count(c) AS unlinkedCount
    `);

    const hotspots = records.map(rec => ({
      facility_type: rec.facility_type,
      facility_id: rec.facility_id,
      facility_name: rec.facility_type === 'Room' ? `Room ${rec.raw_name}` : rec.raw_name,
      hostel_name: rec.hostel_name,
      totalComplaints: rec.totalComplaints,
      openComplaints: rec.openComplaints,
      resolvedComplaints: rec.resolvedComplaints,
      complaints: rec.complaints || []
    }));

    res.json({
      neo4jConnected: true,
      unlinkedComplaintsCount: unlinkedRecords[0]?.unlinkedCount || 0,
      hotspots
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==============================================================================
// VIVA_GRIEVANCE_HOTSPOT: HOTSPOT GRAPH VISUALIZATION & INTENSITY HEAT MAPPING
// VIVA_NEO4J_FRONTEND: DYNAMIC COLOR MAPPING & CANVASES
// VIVA_NEO4J_DATA_VALIDATION: PAYLOAD VALIDATION ENFORCEMENT
// VIVA_NEO4J_API: GET /api/graph/hotspots-graph
// Purpose: Produces Cytoscape elements (nodes & edges) representing grievance clusters with dynamic heat mapping properties for visual triage.
// Entry point: GET /api/graph/hotspots-graph
// Input: category and status query filters.
// Logic:
//   1. Gathers complaints and linked facilities from authoritative source.
//   2. Groups complaints by facility and tracks open vs resolved counts.
//   3. Computes intensity scales:
//      - 'high': openComplaints >= 3 OR openComplaints equals maximum open count (rendered in bright red #ef4444 with glowing shadow).
//      - 'medium': openComplaints >= 2 (rendered in orange #f97316).
//      - 'low': openComplaints >= 1 (rendered in yellow #eab308).
//      - 'neutral': 0 open complaints (rendered in slate gray #334155).
//   4. Generates nodes for Facility, Hostel parent, and individual Complaints.
//   5. Connects complaints to facilities with [:ASSOCIATED_WITH] edges.
//   6. Enforces endpoint integrity using validateGraphPayload() before returning JSON.
// Output: JSON { unlinkedComplaintsCount, totalHotspots, maxOpenComplaints, elements: { nodes, edges } }.
// Viva explanation: "The hotspots-graph endpoint powers our interactive red-intensity visualizer. It computes an intensity metric for each facility based on unresolved complaints. High-intensity nodes are styled in red with 48-pixel diameters and drop shadows, while low-intensity nodes appear smaller in yellow. validateGraphPayload ensures that every edge points to a valid facility node so Cytoscape never renders dangling lines."
// Demonstration search: VIVA_GRIEVANCE_HOTSPOT
// ==============================================================================
router.get('/hotspots-graph', async (req, res) => {
  const category = req.query.category || 'All';
  const status = req.query.status || 'All';

  try {
    const src = await fetchSourceData();

    // 1. Filter complaints
    const filteredComplaints = (src.complaints || []).filter(c => {
      const ct = (src.complaintTypes || []).find(t => t.complaint_type_id === c.complaint_type_id) || {};
      if (category !== 'All' && ct.category !== category) return false;
      if (status === 'Open' && c.status === 'Resolved') return false;
      if (status !== 'All' && status !== 'Open' && c.status !== status) return false;
      return true;
    });

    const unlinkedCount = filteredComplaints.filter(c => !c.room_id && !c.mess_id && !c.hostel_id).length;

    // 2. Group linked complaints by facility
    const facilityMap = new Map();
    for (const c of filteredComplaints) {
      let key = null;
      let facType = '';
      let facName = '';
      let facId = null;
      let hostelId = null;
      let hostelName = '';

      if (c.room_id) {
        key = `Room_${c.room_id}`;
        facType = 'Room';
        facId = c.room_id;
        const rm = (src.rooms || []).find(r => r.room_id === c.room_id) || {};
        const fl = (src.floors || []).find(f => f.floor_id === rm.floor_id) || {};
        const bl = (src.blocks || []).find(b => b.block_id === fl.block_id) || {};
        const hs = (src.hostels || []).find(h => h.hostel_id === bl.hostel_id) || {};
        facName = `Room ${rm.room_number}`;
        hostelId = hs.hostel_id || null;
        hostelName = hs.hostel_name || 'Campus';
      } else if (c.mess_id) {
        key = `Mess_${c.mess_id}`;
        facType = 'Mess';
        facId = c.mess_id;
        const ms = (src.messes || []).find(m => m.mess_id === c.mess_id) || {};
        const hs = (src.hostels || []).find(h => h.hostel_id === ms.hostel_id) || {};
        facName = ms.mess_name || `Mess ${c.mess_id}`;
        hostelId = hs.hostel_id || null;
        hostelName = hs.hostel_name || 'Campus Dining';
      } else if (c.hostel_id) {
        key = `Hostel_${c.hostel_id}`;
        facType = 'Hostel';
        facId = c.hostel_id;
        const hs = (src.hostels || []).find(h => h.hostel_id === c.hostel_id) || {};
        facName = hs.hostel_name || `Hostel ${c.hostel_id}`;
        hostelId = hs.hostel_id;
        hostelName = hs.hostel_name;
      }

      if (key) {
        if (!facilityMap.has(key)) {
          facilityMap.set(key, {
            key,
            facType,
            facId,
            facName,
            hostelId,
            hostelName,
            totalComplaints: 0,
            openComplaints: 0,
            resolvedComplaints: 0,
            complaints: []
          });
        }
        const item = facilityMap.get(key);
        item.totalComplaints++;
        if (c.status === 'Resolved') item.resolvedComplaints++;
        else item.openComplaints++;

        const ct = (src.complaintTypes || []).find(t => t.complaint_type_id === c.complaint_type_id) || {};
        item.complaints.push({
          complaint_id: c.complaint_id,
          description: c.description,
          status: c.status,
          complaint_date: c.complaint_date,
          type_name: ct.type_name || 'General',
          category: ct.category || 'General'
        });
      }
    }

    // 3. Compute Hotspot Intensity Scale
    let maxOpen = 0;
    for (const fac of facilityMap.values()) {
      if (fac.openComplaints > maxOpen) maxOpen = fac.openComplaints;
    }

    const rawNodes = [];
    const rawEdges = [];
    const addedNodes = new Set();

    function addNode(type, id, label, extra = {}) {
      const graphId = getNodeGraphId(type, id);
      if (!graphId || addedNodes.has(graphId)) return graphId;
      addedNodes.add(graphId);
      rawNodes.push({
        data: {
          id: graphId,
          label: String(label || graphId),
          type,
          ...extra
        }
      });
      return graphId;
    }

    function addEdge(sourceId, targetId, relType, extra = {}) {
      if (!sourceId || !targetId || !relType) return null;
      const edgeId = getEdgeGraphId(sourceId, relType, targetId);
      rawEdges.push({
        data: {
          id: edgeId,
          source: sourceId,
          target: targetId,
          label: relType,
          ...extra
        }
      });
      return edgeId;
    }

    // 4. Generate Facility Hotspot Nodes
    for (const fac of facilityMap.values()) {
      let intensity = 'neutral';
      if (fac.openComplaints >= 3 || (fac.openComplaints > 0 && fac.openComplaints === maxOpen)) {
        intensity = 'high';
      } else if (fac.openComplaints >= 2) {
        intensity = 'medium';
      } else if (fac.openComplaints >= 1) {
        intensity = 'low';
      }

      const facGraphId = addNode(fac.facType, fac.facId, fac.facName, {
        facility_id: fac.facId,
        facility_type: fac.facType,
        facility_name: fac.facName,
        hostel_name: fac.hostelName,
        openComplaints: fac.openComplaints,
        resolvedComplaints: fac.resolvedComplaints,
        totalComplaints: fac.totalComplaints,
        hotspotIntensity: intensity,
        isHotspot: fac.openComplaints > 0
      });

      // Add Hostel node if facility is room or mess
      if (fac.hostelId && fac.facType !== 'Hostel') {
        const hs = (src.hostels || []).find(h => h.hostel_id === fac.hostelId);
        if (hs) {
          const hostelGraphId = addNode('Hostel', hs.hostel_id, hs.hostel_name, {
            hostel_id: hs.hostel_id,
            hostel_name: hs.hostel_name,
            hostel_type: hs.hostel_type
          });
          const rel = fac.facType === 'Mess' ? 'LOCATED_AT' : 'LOCATED_IN';
          addEdge(facGraphId, hostelGraphId, rel);
        }
      }

      // Add Complaint nodes & link to facility
      fac.complaints.forEach(c => {
        const compGraphId = addNode('Complaint', c.complaint_id, `Grievance #${c.complaint_id}`, {
          complaint_id: c.complaint_id,
          description: c.description,
          status: c.status,
          complaint_date: c.complaint_date,
          type_name: c.type_name,
          category: c.category
        });
        addEdge(compGraphId, facGraphId, 'ASSOCIATED_WITH');
      });
    }

    const validated = validateGraphPayload(rawNodes, rawEdges);

    res.json({
      unlinkedComplaintsCount: unlinkedCount,
      totalHotspots: facilityMap.size,
      maxOpenComplaints: maxOpen,
      elements: {
        nodes: validated.nodes,
        edges: validated.edges
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==============================================================================
// VIVA_GRIEVANCE_HOTSPOT: FACILITY GRIEVANCE DRILLDOWN ENDPOINT
// VIVA_NEO4J_API: GET /api/graph/facilities/:facilityType/:facilityId/complaints
// VIVA_NEO4J_CYPHER: TARGETED FACILITY GRIEVANCE RETRIEVAL VIA [:ASSOCIATED_WITH]
// VIVA_NEO4J_FALLBACK: AUTHORITATIVE MYSQL RELATIONAL FACILITY COMPLAINT QUERY
// VIVA_NEO4J_DATA_VALIDATION: PARAMETER SANITIZATION & FACILITY TYPE VALIDATION
// Purpose: Retrieves all grievance tickets explicitly associated with a target facility (Room, Mess, or Hostel)
//          for modal inspection. Returns reporter details, categories, descriptions, status, and resolution notes.
// Entry point: GET /api/graph/facilities/:facilityType/:facilityId/complaints
// Input parameters:
//   - facilityType: 'room', 'mess', or 'hostel' (case-insensitive)
//   - facilityId: numeric identifier (room_id, mess_id, or hostel_id)
// Logic:
//   1. Validates facilityType in ['room', 'mess', 'hostel'] and facilityId as a positive integer.
//   2. If Neo4j online: Traverses (Complaint)-[:ASSOCIATED_WITH]->(Facility) in graph.
//   3. If Neo4j offline: Executes parameterized SQL query against MySQL Complaint table.
// Output: JSON { success, neo4jConnected, facility, counts: { total, open, resolved }, complaints: [...] }
// ==============================================================================
router.get('/facilities/:facilityType/:facilityId/complaints', async (req, res) => {
  const rawType = (req.params.facilityType || '').toLowerCase();
  const facilityId = Number(req.params.facilityId);

  const validTypes = ['room', 'mess', 'hostel'];
  if (!validTypes.includes(rawType)) {
    return res.status(400).json({
      error: `Invalid facility type '${req.params.facilityType}'. Supported types: 'room', 'mess', 'hostel'.`
    });
  }

  if (isNaN(facilityId) || facilityId <= 0) {
    return res.status(400).json({
      error: 'Valid numeric facilityId is required.'
    });
  }

  const capitalizedType = rawType.charAt(0).toUpperCase() + rawType.slice(1);

  // 1. Relational Fallback Engine (MySQL)
  if (!req.neo4jConnected) {
    try {
      const src = await fetchSourceData();
      let facilityName = `${capitalizedType} #${facilityId}`;
      let hostelName = 'Campus';

      // Look up facility display metadata from source data
      if (rawType === 'room') {
        const rm = (src.rooms || []).find(r => r.room_id === facilityId);
        if (rm) {
          const fl = (src.floors || []).find(f => f.floor_id === rm.floor_id);
          const bl = fl ? (src.blocks || []).find(b => b.block_id === fl.block_id) : null;
          const hs = bl ? (src.hostels || []).find(h => h.hostel_id === bl.hostel_id) : null;
          facilityName = `Room ${rm.room_number}`;
          hostelName = hs?.hostel_name || 'Campus';
        }
      } else if (rawType === 'mess') {
        const ms = (src.messes || []).find(m => m.mess_id === facilityId);
        if (ms) {
          const hs = (src.hostels || []).find(h => h.hostel_id === ms.hostel_id);
          facilityName = ms.mess_name;
          hostelName = hs?.hostel_name || 'Campus Dining';
        }
      } else if (rawType === 'hostel') {
        const hs = (src.hostels || []).find(h => h.hostel_id === facilityId);
        if (hs) {
          facilityName = hs.hostel_name;
          hostelName = hs.hostel_name;
        }
      }

      // Filter complaints specifically associated with this facility
      const matchedComplaints = (src.complaints || []).filter(c => {
        if (rawType === 'room') return c.room_id === facilityId;
        if (rawType === 'mess') return c.mess_id === facilityId;
        if (rawType === 'hostel') return c.hostel_id === facilityId;
        return false;
      });

      const complaints = matchedComplaints.map(c => {
        const s = (src.students || []).find(st => st.student_id === c.student_id) || {};
        const ct = (src.complaintTypes || []).find(t => t.complaint_type_id === c.complaint_type_id) || {};
        return {
          complaint_id: c.complaint_id,
          description: c.description,
          status: c.status,
          complaint_date: c.complaint_date,
          resolved_date: c.resolved_date || null,
          remarks: c.remarks || null,
          type_name: ct.type_name || 'General',
          category: ct.category || 'General',
          student_id: s.student_id || null,
          student_name: s.full_name || null,
          student_reg_no: s.reg_no || null
        };
      }).sort((a, b) => (b.complaint_date || '').localeCompare(a.complaint_date || '') || b.complaint_id - a.complaint_id);

      const total = complaints.length;
      const open = complaints.filter(c => c.status !== 'Resolved').length;
      const resolved = complaints.filter(c => c.status === 'Resolved').length;

      return res.json({
        success: true,
        neo4jConnected: false,
        facility: {
          type: capitalizedType,
          id: facilityId,
          name: facilityName,
          hostel_name: hostelName
        },
        counts: { total, open, resolved },
        complaints
      });
    } catch (err) {
      return res.status(500).json({ error: `Relational query failed: ${err.message}` });
    }
  }

  // 2. Live Cypher Graph Query
  try {
    const cypher = `
      MATCH (fac)
      WHERE (
        ($type = 'room' AND fac:Room AND fac.room_id = $id)
        OR ($type = 'mess' AND fac:Mess AND fac.mess_id = $id)
        OR ($type = 'hostel' AND fac:Hostel AND fac.hostel_id = $id)
      )
      OPTIONAL MATCH (fac)-[:ON_FLOOR]->(fl:Floor)-[:IN_BLOCK]->(b:Block)-[:PART_OF]->(h:Hostel)
      OPTIONAL MATCH (fac)-[:LOCATED_AT]->(mh:Hostel)
      WITH fac, labels(fac)[0] AS facType,
           coalesce(fac.room_number, fac.mess_name, fac.hostel_name) AS raw_name,
           coalesce(h.hostel_name, mh.hostel_name, fac.hostel_name, 'Campus') AS hostel_name
      OPTIONAL MATCH (c:Complaint)-[:ASSOCIATED_WITH]->(fac)
      OPTIONAL MATCH (c)-[:OF_TYPE]->(ct:ComplaintType)
      OPTIONAL MATCH (s:Student)-[:FILED]->(c)
      RETURN facType, raw_name, hostel_name,
             c.complaint_id AS complaint_id,
             c.description AS description,
             c.status AS status,
             c.complaint_date AS complaint_date,
             ct.type_name AS type_name,
             ct.category AS category,
             s.student_id AS student_id,
             s.full_name AS student_name,
             s.reg_no AS student_reg_no
      ORDER BY c.complaint_date DESC, c.complaint_id DESC
    `;

    const records = await neo.readQuery(cypher, {
      type: rawType,
      id: neo.neo4j.int(facilityId)
    });

    if (records.length === 0) {
      return res.status(404).json({
        error: `${capitalizedType} with ID ${facilityId} not found in graph.`
      });
    }

    const first = records[0];
    const rawName = first.raw_name || `#${facilityId}`;
    const facilityName = rawType === 'room' && !String(rawName).startsWith('Room') ? `Room ${rawName}` : rawName;
    const hostelName = first.hostel_name || 'Campus';

    const complaints = [];
    for (const r of records) {
      if (r.complaint_id) {
        complaints.push({
          complaint_id: Number(r.complaint_id),
          description: r.description || '',
          status: r.status || 'Pending',
          complaint_date: r.complaint_date || '',
          type_name: r.type_name || 'General',
          category: r.category || 'General',
          student_id: r.student_id ? Number(r.student_id) : null,
          student_name: r.student_name || null,
          student_reg_no: r.student_reg_no || null
        });
      }
    }

    const total = complaints.length;
    const open = complaints.filter(c => c.status !== 'Resolved').length;
    const resolved = complaints.filter(c => c.status === 'Resolved').length;

    res.json({
      success: true,
      neo4jConnected: true,
      facility: {
        type: capitalizedType,
        id: facilityId,
        name: facilityName,
        hostel_name: hostelName
      },
      counts: { total, open, resolved },
      complaints
    });
  } catch (err) {
    res.status(500).json({ error: `Graph query failed: ${err.message}` });
  }
});

// ==============================================================================
// 4. FEATURE 3: SMART ROOM & VACANCY FINDER (NEO4J DISCOVERY + MYSQL VALIDATION)
// ==============================================================================

// ==============================================================================
// VIVA_SMART_VACANCY: MULTI-TIER GRAPH VACANCY DISCOVERY WITH MYSQL OCCUPANCY RECONCILIATION
// VIVA_NEO4J_API: GET /api/graph/rooms/available
// VIVA_NEO4J_CYPHER: HIERARCHICAL SPATIAL TRAVERSAL (HOSTEL -> BLOCK -> FLOOR -> ROOM -> ROOMTYPE)
// VIVA_NEO4J_DATA_VALIDATION: MANDATORY TWO-WAY OCCUPANCY CONSISTENCY CHECK
// VIVA_NEO4J_FALLBACK: DIRECT RELATIONAL INVENTORY TRAVERSAL
// VIVA_NEO4J_LIMITATIONS: REPORTING ONLY VS ACTUAL ROOM ALLOCATION MUTATION
// Purpose: Discovers available rooms matching student preferences (hostel, block, AC type, minimum capacity) using graph traversal, then verifies bed vacancy against authoritative MySQL records.
// Entry point: GET /api/graph/rooms/available
// Input query parameters:
//   - hostelId: Optional numeric ID of target hostel.
//   - blockId: Optional numeric ID of target residential block.
//   - acType: Optional 'AC' or 'Non-AC' filter.
//   - minCapacity: Optional integer minimum bed capacity (e.g., 2, 3, 4).
// Logic:
//   1. Pulls authoritative MySQL records via fetchSourceData().
//   2. If Neo4j offline: Filters MySQL rooms directly and computes vacant_beds.
//   3. If Neo4j online: Traverses spatial graph hierarchy from Hostel down to Room and RoomType.
// Cypher explanation:
//   - MATCH (h:Hostel)<-[:PART_OF]-(b:Block)<-[:IN_BLOCK]-(fl:Floor)<-[:ON_FLOOR]-(r:Room)-[:HAS_TYPE]->(rt:RoomType):
//     Traverses 5 structural node tiers in a single graph pattern without relational join tables.
//   - WHERE ($hostelId IS NULL OR h.hostel_id = $hostelId) AND ...: Applies optional filter parameters dynamically.
//   - OPTIONAL MATCH (s:Student)-[a:ALLOCATED_TO {status: 'Active'}]->(r):
//     Matches incoming active allocation edges to count current occupants.
//   - count(a) AS graph_occupancy: Computes graph-reported occupancy.
// MySQL role & Reconciliation check:
//   - MANDATORY STEP: Every candidate returned by Neo4j is cross-checked against MySQL RoomAllocation records.
//   - Calculation: authoritativeOccupancy = activeInMySQL.length; vacant_beds = Math.max(0, capacity - authoritativeOccupancy).
//   - Consistency flag: isConsistent = (authoritativeOccupancy === gc.graph_occupancy).
//   - Purpose: If the graph is stale or ETL sync has not run after a recent allocation, MySQL overrides the graph count, preventing double-booking and room over-allocation.
// Does this endpoint allocate rooms:
//   NO. This endpoint is strictly an analytical discovery service. Room allocations require executing transactional business logic and audit logging in MySQL.
// Are fully occupied rooms returned:
//   YES. Rooms with 0 vacant beds are returned with vacant_beds: 0 and current_occupancy == capacity so administrators have complete visibility into hostel capacity.
// Output: JSON { neo4jConnected, discoveryMethod, candidateCount, rooms: [{ room_id, room_number, hostel_name, capacity, current_occupancy, vacant_beds, isConsistent, verified: true }] }.
// Viva explanation: "Smart Vacancy combines the speed of Neo4j graph traversal with the strict correctness of MySQL. Cypher traverses the 5-level spatial tree from Hostel to RoomType and filters candidates. Then, our backend performs a mandatory cross-verification against MySQL active allocations in memory using vacant_beds = max(0, capacity - occupancy). If graph drift exists, MySQL overrides the count, guaranteeing zero over-allocation. Note that this endpoint discovers candidate rooms—it does not execute the booking transaction."
// Demonstration search: VIVA_SMART_VACANCY
// ==============================================================================
router.get('/rooms/available', async (req, res) => {
  const { hostelId, blockId, acType, minCapacity } = req.query;

  // 1. Authoritative MySQL inventory & occupancy
  const src = await fetchSourceData();

  // If Neo4j is offline, use MySQL inventory directly
  if (!req.neo4jConnected) {
    const candidateRooms = src.rooms.map(r => {
      const fl = src.floors.find(f => f.floor_id === r.floor_id) || {};
      const bl = src.blocks.find(b => b.block_id === fl.block_id) || {};
      const hs = src.hostels.find(h => h.hostel_id === bl.hostel_id) || {};
      const rt = src.roomTypes.find(t => t.room_type_id === r.room_type_id) || {};

      const activeAllocs = src.roomAllocations.filter(a => a.room_id === r.room_id && a.status === 'Active');
      const realOccupancy = activeAllocs.length;
      const capacity = rt.capacity || 0;
      const vacantBeds = Math.max(0, capacity - realOccupancy);

      return {
        room_id: r.room_id,
        room_number: r.room_number,
        hostel_id: hs.hostel_id,
        hostel_name: hs.hostel_name,
        hostel_type: hs.hostel_type,
        block_id: bl.block_id,
        block_name: bl.block_name,
        floor_number: fl.floor_number,
        capacity,
        current_occupancy: realOccupancy,
        vacant_beds: vacantBeds,
        ac_type: rt.ac_type,
        fee_per_semester: rt.fee_per_semester,
        authoritativeSource: 'MySQL / Data Engine',
        verified: true
      };
    }).filter(r => {
      if (hostelId && r.hostel_id !== Number(hostelId)) return false;
      if (blockId && r.block_id !== Number(blockId)) return false;
      if (acType && r.ac_type !== acType) return false;
      if (minCapacity && r.capacity < Number(minCapacity)) return false;
      return true;
    });

    return res.json({
      neo4jConnected: false,
      notice: 'Candidate discovery executed directly via relational engine.',
      candidateCount: candidateRooms.length,
      rooms: candidateRooms
    });
  }

  // 2. Discover candidates via Neo4j Graph traversal
  try {
    const cypher = `
      MATCH (h:Hostel)<-[:PART_OF]-(b:Block)<-[:IN_BLOCK]-(fl:Floor)<-[:ON_FLOOR]-(r:Room)-[:HAS_TYPE]->(rt:RoomType)
      WHERE ($hostelId IS NULL OR h.hostel_id = $hostelId)
        AND ($blockId IS NULL OR b.block_id = $blockId)
        AND ($acType IS NULL OR rt.ac_type = $acType)
        AND ($minCapacity IS NULL OR rt.capacity >= $minCapacity)
      OPTIONAL MATCH (s:Student)-[a:ALLOCATED_TO {status: 'Active'}]->(r)
      RETURN r.room_id AS room_id,
             r.room_number AS room_number,
             h.hostel_id AS hostel_id,
             h.hostel_name AS hostel_name,
             h.hostel_type AS hostel_type,
             b.block_id AS block_id,
             b.block_name AS block_name,
             fl.floor_number AS floor_number,
             rt.capacity AS capacity,
             rt.ac_type AS ac_type,
             rt.fee_per_semester AS fee_per_semester,
             count(a) AS graph_occupancy
      ORDER BY h.hostel_name, r.room_number
    `;

    const params = {
      hostelId: hostelId ? Number(hostelId) : null,
      blockId: blockId ? Number(blockId) : null,
      acType: acType || null,
      minCapacity: minCapacity ? Number(minCapacity) : null
    };

    const graphCandidates = await neo.readQuery(cypher, params);

    // 3. MANDATORY STEP: Validate each candidate against authoritative MySQL records
    // Prevent over-allocation and reconcile any graph drift
    const verifiedRooms = graphCandidates.map(gc => {
      const activeInMySQL = src.roomAllocations.filter(a => a.room_id === gc.room_id && a.status === 'Active');
      const authoritativeOccupancy = activeInMySQL.length;
      const capacity = gc.capacity || 0;
      const authoritativeVacantBeds = Math.max(0, capacity - authoritativeOccupancy);
      const isConsistent = authoritativeOccupancy === gc.graph_occupancy;

      return {
        room_id: gc.room_id,
        room_number: gc.room_number,
        hostel_id: gc.hostel_id,
        hostel_name: gc.hostel_name,
        hostel_type: gc.hostel_type,
        block_id: gc.block_id,
        block_name: gc.block_name,
        floor_number: gc.floor_number,
        capacity,
        ac_type: gc.ac_type,
        fee_per_semester: gc.fee_per_semester,
        current_occupancy: authoritativeOccupancy,
        vacant_beds: authoritativeVacantBeds,
        graph_reported_occupancy: gc.graph_occupancy,
        isConsistent,
        authoritativeSource: 'MySQL (Validated)',
        verified: true
      };
    });

    res.json({
      neo4jConnected: true,
      discoveryMethod: 'Neo4j Graph Traversal + Authoritative MySQL Vacancy Verification',
      candidateCount: verifiedRooms.length,
      rooms: verifiedRooms
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==============================================================================
// 5. FEATURE 4: MESS & STUDENT CONNECTION EXPLORER
// ==============================================================================

// ==============================================================================
// VIVA_MESS_CONNECTION: DINING SUPPLY NETWORK & STUDENT REGISTRATION EXPLORER
// VIVA_NEO4J_API: GET /api/graph/mess/:messId/connections
// VIVA_NEO4J_CYPHER: MULTI-ENTITY OPTIONAL MATCH ACROSS CATERER, HOSTEL, STUDENTS, COMPLAINTS
// VIVA_NEO4J_FALLBACK: IN-MEMORY RELATIONAL DINING NETWORK JOIN
// VIVA_NEO4J_LIMITATIONS: ASSOCIATION VS CAUSATION IN CONTRACTOR GRIEVANCES
// Purpose: Explores a dining hall's complete ecosystem: its commercial caterer contractor, hostel location, actively registered diners, and logged grievances.
// Entry point: GET /api/graph/mess/:messId/connections
// Input: :messId path parameter (numeric).
// Logic:
//   - If Neo4j offline: Filters MySQL source data across caterers, hostels, messRegistrations, and complaints.
//   - If Neo4j online: Traverses 4 distinct outgoing and incoming relationship types from the focal Mess node.
// Cypher explanation:
//   - MATCH (m:Mess {mess_id: $messId}): Binds the target dining facility node.
//   - OPTIONAL MATCH (m)-[:SERVED_BY]->(cat:Caterer): Traverses to the contracted catering firm.
//   - OPTIONAL MATCH (m)-[:LOCATED_AT]->(h:Hostel): Traverses to the physical hostel location.
//   - OPTIONAL MATCH (s:Student)-[reg:REGISTERED_FOR {status: 'Active'}]->(m): Traverses incoming active student subscriptions.
//   - OPTIONAL MATCH (c:Complaint)-[:ASSOCIATED_WITH]->(m): Traverses incoming grievances tied specifically to this dining hall.
//   - OPTIONAL MATCH (c)-[:OF_TYPE]->(ct:ComplaintType): Resolves the complaint category taxonomy.
//   - collect(DISTINCT {...}): Collects students and complaints into distinct arrays in a single round-trip.
// Practical value to hostel administrators:
//   Gives managers immediate 360-degree visibility: contractor SLAs, dining load against capacity, and student satisfaction feedback in one view.
// Causation limitation:
//   CRITICAL DISTINCTION: Relationships represent stored operational links. A complaint linked to a mess via ASSOCIATED_WITH shows that students reported an issue in that hall; it does not automatically prove the caterer violated health codes without administrative audit.
// Output: JSON { neo4jConnected, mess, caterer, registeredStudentsCount, registeredStudents, linkedComplaintsCount, linkedComplaints }.
// Viva explanation: "The Mess Connection Explorer demonstrates a multi-relationship graph pattern. Starting at the Mess node, Cypher traverses [:SERVED_BY] to the Caterer, [:LOCATED_AT] to the Hostel, [:REGISTERED_FOR] to active Students, and [:ASSOCIATED_WITH] from Complaints. This gives hostel administrators a 360-degree audit trail connecting catering contractors to meal satisfaction and student rosters in a single query."
// Demonstration search: VIVA_MESS_CONNECTION
// ==============================================================================
router.get('/mess/:messId/connections', async (req, res) => {
  const messId = Number(req.params.messId);
  if (isNaN(messId)) {
    return res.status(400).json({ error: 'Valid numeric messId is required.' });
  }

  const src = await fetchSourceData();
  const messRecord = src.messes.find(m => m.mess_id === messId);
  if (!messRecord) {
    return res.status(404).json({ error: `Mess facility with ID ${messId} not found.` });
  }

  if (!req.neo4jConnected) {
    // Relational calculation of mess connections
    const caterer = src.caterers.find(c => c.caterer_id === messRecord.caterer_id) || {};
    const hostel = src.hostels.find(h => h.hostel_id === messRecord.hostel_id) || {};
    const activeRegs = src.messRegistrations.filter(r => r.mess_id === messId && r.status === 'Active');
    const students = activeRegs.map(r => {
      const s = src.students.find(st => st.student_id === r.student_id) || {};
      return {
        student_id: s.student_id,
        reg_no: s.reg_no,
        full_name: s.full_name,
        branch: s.branch,
        registration_date: r.registration_date
      };
    });

    const complaints = src.complaints.filter(c => c.mess_id === messId).map(c => {
      const ct = src.complaintTypes.find(t => t.complaint_type_id === c.complaint_type_id) || {};
      return {
        complaint_id: c.complaint_id,
        description: c.description,
        status: c.status,
        complaint_date: c.complaint_date,
        type_name: ct.type_name
      };
    });

    return res.json({
      neo4jConnected: false,
      mess: {
        mess_id: messRecord.mess_id,
        mess_name: messRecord.mess_name,
        mess_category: messRecord.mess_category,
        monthly_fee: messRecord.monthly_fee,
        capacity: messRecord.capacity,
        hostel_name: hostel.hostel_name
      },
      caterer: {
        caterer_id: caterer.caterer_id,
        caterer_name: caterer.caterer_name,
        contact_person: caterer.contact_person,
        contact_number: caterer.contact_number,
        contract_start_date: caterer.contract_start_date,
        contract_end_date: caterer.contract_end_date
      },
      registeredStudentsCount: students.length,
      registeredStudents: students,
      linkedComplaintsCount: complaints.length,
      linkedComplaints: complaints
    });
  }

  // Live Cypher Graph Query
  try {
    const cypher = `
      MATCH (m:Mess {mess_id: $messId})
      OPTIONAL MATCH (m)-[:SERVED_BY]->(cat:Caterer)
      OPTIONAL MATCH (m)-[:LOCATED_AT]->(h:Hostel)
      OPTIONAL MATCH (s:Student)-[reg:REGISTERED_FOR {status: 'Active'}]->(m)
      OPTIONAL MATCH (c:Complaint)-[:ASSOCIATED_WITH]->(m)
      OPTIONAL MATCH (c)-[:OF_TYPE]->(ct:ComplaintType)
      RETURN m, cat, h,
             collect(DISTINCT {
               student_id: s.student_id,
               reg_no: s.reg_no,
               full_name: s.full_name,
               branch: s.branch,
               registration_date: reg.registration_date
             }) AS rawStudents,
             collect(DISTINCT {
               complaint_id: c.complaint_id,
               description: c.description,
               status: c.status,
               complaint_date: c.complaint_date,
               type_name: ct.type_name
             }) AS rawComplaints
    `;

    const records = await neo.readQuery(cypher, { messId });
    if (!records || records.length === 0) {
      return res.status(404).json({ error: `Mess with ID ${messId} not found in Neo4j graph.` });
    }

    const row = records[0];
    const m = row.m || {};
    const cat = row.cat || {};
    const h = row.h || {};

    const students = (row.rawStudents || []).filter(s => s && s.student_id);
    const complaints = (row.rawComplaints || []).filter(c => c && c.complaint_id);

    res.json({
      neo4jConnected: true,
      mess: {
        mess_id: m.mess_id,
        mess_name: m.mess_name,
        mess_category: m.mess_category,
        monthly_fee: m.monthly_fee,
        capacity: m.capacity,
        hostel_name: h.hostel_name || 'Campus Dining'
      },
      caterer: {
        caterer_id: cat.caterer_id,
        caterer_name: cat.caterer_name,
        contact_person: cat.contact_person,
        contact_number: cat.contact_number,
        contract_start_date: cat.contract_start_date,
        contract_end_date: cat.contract_end_date
      },
      registeredStudentsCount: students.length,
      registeredStudents: students,
      linkedComplaintsCount: complaints.length,
      linkedComplaints: complaints
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==============================================================================
// VIVA_MESS_CONNECTION: DEDICATED CYTOSCAPE GRAPH PAYLOAD FOR MESS NETWORK
// VIVA_NEO4J_FRONTEND: FOCAL MESS NODE HIGHLIGHTING & STAR TOPOLOGY
// VIVA_NEO4J_DATA_VALIDATION: PAYLOAD ENDPOINT VERIFICATION
// VIVA_NEO4J_API: GET /api/graph/mess/:messId/graph
// Purpose: Constructs a dedicated Cytoscape graph payload centering on a single mess facility, displaying its caterer, physical hostel, active diners, and complaints.
// Entry point: GET /api/graph/mess/:messId/graph
// Input: :messId
// Logic:
//   1. Retrieves mess, caterer, hostel, registered students, and linked complaints from authoritative source.
//   2. Creates the focal Mess node with special properties (isFocus: true, isSelectedMess: true).
//   3. Creates Caterer (diamond shape), Hostel (hexagon shape), Students (ellipse), and Complaints (triangle).
//   4. Establishes edges: SERVED_BY, LOCATED_AT, REGISTERED_FOR, ASSOCIATED_WITH.
//   5. Runs validateGraphPayload() to ensure 0 dangling edges before JSON dispatch.
// Output: JSON { mess_id, mess_name, registeredCount, complaintCount, elements: { nodes, edges } }.
// Viva explanation: "The mess graph endpoint generates a star-topology subgraph around the selected dining hall. The Mess node is styled in bright orange with a 48px tag shape. Outgoing edges connect to the caterer and hostel, while incoming edges connect active registered students and grievances. validateGraphPayload verifies that all 100% of edges connect real nodes."
// Demonstration search: VIVA_MESS_CONNECTION
// ==============================================================================
router.get('/mess/:messId/graph', async (req, res) => {
  const messId = Number(req.params.messId);
  if (isNaN(messId)) {
    return res.status(400).json({ error: 'Valid numeric messId is required.' });
  }

  const rawNodes = [];
  const rawEdges = [];
  const addedNodes = new Set();

  function addNode(type, id, label, extra = {}) {
    const graphId = getNodeGraphId(type, id);
    if (!graphId || addedNodes.has(graphId)) return graphId;
    addedNodes.add(graphId);
    rawNodes.push({
      data: {
        id: graphId,
        label: String(label || graphId),
        type,
        ...extra
      }
    });
    return graphId;
  }

  function addEdge(sourceId, targetId, relType, extra = {}) {
    if (!sourceId || !targetId || !relType) return null;
    const edgeId = getEdgeGraphId(sourceId, relType, targetId);
    rawEdges.push({
      data: {
        id: edgeId,
        source: sourceId,
        target: targetId,
        label: relType,
        ...extra
      }
    });
    return edgeId;
  }

  try {
    const src = await fetchSourceData();
    const mess = (src.messes || []).find(m => m.mess_id === messId);
    if (!mess) {
      return res.status(404).json({ error: `Mess facility with ID ${messId} not found.` });
    }

    const caterer = (src.caterers || []).find(c => c.caterer_id === mess.caterer_id);
    const hostel = (src.hostels || []).find(h => h.hostel_id === mess.hostel_id);

    // 1. Focal Mess Node
    const messGraphId = addNode('Mess', mess.mess_id, mess.mess_name, {
      mess_id: mess.mess_id,
      mess_name: mess.mess_name,
      mess_category: mess.mess_category,
      capacity: mess.capacity,
      monthly_fee: mess.monthly_fee,
      hostel_name: hostel?.hostel_name || 'Campus Dining',
      isFocus: true,
      isSelectedMess: true
    });

    // 2. Caterer Node
    if (caterer) {
      const catGraphId = addNode('Caterer', caterer.caterer_id, caterer.caterer_name, {
        caterer_id: caterer.caterer_id,
        caterer_name: caterer.caterer_name,
        contact_person: caterer.contact_person,
        contact_number: caterer.contact_number,
        contract_start_date: caterer.contract_start_date,
        contract_end_date: caterer.contract_end_date
      });
      addEdge(messGraphId, catGraphId, 'SERVED_BY');
    }

    // 3. Hostel Location Node
    if (hostel) {
      const hostelGraphId = addNode('Hostel', hostel.hostel_id, hostel.hostel_name, {
        hostel_id: hostel.hostel_id,
        hostel_name: hostel.hostel_name,
        hostel_type: hostel.hostel_type
      });
      addEdge(messGraphId, hostelGraphId, 'LOCATED_AT');
    }

    // 4. Active Registered Students
    const activeRegs = (src.messRegistrations || []).filter(r => r.mess_id === messId && r.status === 'Active');
    activeRegs.forEach(reg => {
      const st = (src.students || []).find(s => s.student_id === reg.student_id);
      if (st) {
        const studentGraphId = addNode('Student', st.student_id, st.full_name, {
          student_id: st.student_id,
          reg_no: st.reg_no,
          branch: st.branch,
          course: st.course,
          registration_date: reg.registration_date
        });
        addEdge(studentGraphId, messGraphId, 'REGISTERED_FOR', { registration_date: reg.registration_date });
      }
    });

    // 5. Linked Grievances
    const linkedComplaints = (src.complaints || []).filter(c => c.mess_id === messId);
    linkedComplaints.forEach(c => {
      const ct = (src.complaintTypes || []).find(t => t.complaint_type_id === c.complaint_type_id);
      const compGraphId = addNode('Complaint', c.complaint_id, `Grievance #${c.complaint_id}`, {
        complaint_id: c.complaint_id,
        description: c.description,
        status: c.status,
        complaint_date: c.complaint_date,
        type_name: ct?.type_name || 'Mess Dining'
      });
      addEdge(compGraphId, messGraphId, 'ASSOCIATED_WITH');
    });

    const validated = validateGraphPayload(rawNodes, rawEdges);

    res.json({
      mess_id: mess.mess_id,
      mess_name: mess.mess_name,
      registeredCount: activeRegs.length,
      complaintCount: linkedComplaints.length,
      elements: {
        nodes: validated.nodes,
        edges: validated.edges
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==============================================================================
// 6. FEATURE 5: INTERACTIVE RELATIONSHIP GRAPH EXPLORER
// ==============================================================================

// VIVA_NEO4J_FRONTEND
// VIVA_NEO4J_API
/**
 * PURPOSE:
 *   Supplies graph topology elements (nodes & edges) specifically formatted for
 *   interactive rendering in Cytoscape.js. Supports multi-entity scoping (all campus,
 *   single student, single room, or single mess) with connected subgraphs.
 *
 * ENTRY POINT:
 *   GET /api/graph/explore?type={all|student|room|mess}&id={numericId}&limit={n}
 *
 * INPUT PARAMETERS:
 *   - type: entity filter category ('all', 'student', 'room', 'mess')
 *   - id: target entity ID (e.g. student_id, room_id, mess_id)
 *   - limit: maximum record limit (clamped between 1 and 100, default: 60)
 *
 * OUTPUT PAYLOAD:
 *   {
 *     neo4jConnected: true | false,
 *     elements: {
 *       nodes: [ { data: { id: "student:1", label: "John Doe", type: "Student", ... } } ],
 *       edges: [ { data: { id: "edge:student:1-ALLOCATED_TO-room:5", source: "...", target: "...", label: "ALLOCATED_TO" } } ]
 *     }
 *   }
 *
 * VIVA 30-SECOND EXPLANATION:
 *   "This endpoint bridges our graph backend and Cytoscape.js frontend. It dynamically executes
 *   subgraph queries tailored to whichever entity is being inspected—whether an entire campus cluster
 *   or a focused 2-hop radius around a specific student, room, or dining hall. If Neo4j is online,
 *   it traverses live graph nodes; if offline, it gracefully falls back to generating a synthetic
 *   graph topology directly from MySQL relational tables."
 *
 * DEMONSTRATION SEARCH:
 *   Ctrl + Shift + F -> VIVA_NEO4J_FRONTEND
 */
router.get('/explore', async (req, res) => {
  const entityType = (req.query.type || 'all').toLowerCase(); // all, student, room, mess, hostel, complaint
  const entityId = req.query.id ? Number(req.query.id) : null;
  const limit = Math.min(Number(req.query.limit) || 60, 100);

  // VIVA_NEO4J_FALLBACK
  // 1. Fallback graph topology generator if Neo4j is offline
  // Synthesizes Cytoscape.js graph elements directly from MySQL relational tables
  if (!req.neo4jConnected) {
    const src = await fetchSourceData();
    const rawNodes = [];
    const rawEdges = [];
    const addedNodeIds = new Set();

    function addNode(type, id, label, extra = {}) {
      const graphId = getNodeGraphId(type, id);
      if (!graphId) return null;
      if (!addedNodeIds.has(graphId)) {
        addedNodeIds.add(graphId);
        rawNodes.push({
          data: {
            id: graphId,
            label: String(label || graphId),
            type, // 'Student', 'Room', 'Hostel', 'Mess', 'Caterer', 'Complaint'
            ...extra
          }
        });
      }
      return graphId;
    }

    function addEdge(sourceId, targetId, relType, extra = {}) {
      if (!sourceId || !targetId || !relType) return null;
      if (!addedNodeIds.has(sourceId) || !addedNodeIds.has(targetId)) {
        console.warn(`[Graph Fallback] Skipping edge ${sourceId} -[:${relType}]-> ${targetId}: endpoint missing from node collection`);
        return null;
      }
      const edgeId = getEdgeGraphId(sourceId, relType, targetId);
      rawEdges.push({
        data: {
          id: edgeId,
          source: sourceId,
          target: targetId,
          label: relType,
          ...extra
        }
      });
      return edgeId;
    }

    // A. ALL Hostels
    (src.hostels || []).forEach(h => {
      addNode('Hostel', h.hostel_id, h.hostel_name, {
        hostel_id: h.hostel_id,
        hostel_type: h.hostel_type,
        warden_name: h.warden_name
      });
    });

    // B. ALL Rooms
    (src.rooms || []).forEach(r => {
      const fl = (src.floors || []).find(f => f.floor_id === r.floor_id);
      const bl = fl ? (src.blocks || []).find(b => b.block_id === fl.block_id) : null;
      const rt = (src.roomTypes || []).find(t => t.room_type_id === r.room_type_id);
      const roomGraphId = addNode('Room', r.room_id, `Room ${r.room_number}`, {
        room_id: r.room_id,
        room_number: r.room_number,
        occupancy: r.current_occupancy,
        capacity: rt?.capacity || 2,
        ac_type: rt?.ac_type || 'Non-AC'
      });
      if (bl && bl.hostel_id) {
        const hostelGraphId = getNodeGraphId('Hostel', bl.hostel_id);
        addEdge(roomGraphId, hostelGraphId, 'PART_OF');
      }
    });

    // C. ALL Caterers
    (src.caterers || []).forEach(cat => {
      addNode('Caterer', cat.caterer_id, cat.caterer_name, {
        caterer_id: cat.caterer_id,
        contact_person: cat.contact_person,
        contact_number: cat.contact_number
      });
    });

    // D. ALL Messes (Every single mess, including Mess 5!)
    (src.messes || []).forEach(m => {
      const messGraphId = addNode('Mess', m.mess_id, m.mess_name, {
        mess_id: m.mess_id,
        mess_category: m.mess_category,
        capacity: m.capacity,
        monthly_fee: m.monthly_fee
      });

      if (m.caterer_id) {
        const catererGraphId = getNodeGraphId('Caterer', m.caterer_id);
        addEdge(messGraphId, catererGraphId, 'SERVED_BY');
      }
      if (m.hostel_id) {
        const hostelGraphId = getNodeGraphId('Hostel', m.hostel_id);
        addEdge(messGraphId, hostelGraphId, 'LOCATED_AT');
      }
    });

    // E. Students (filtered if entityId specified, or all)
    const studentList = (entityType === 'student' && entityId)
      ? (src.students || []).filter(s => s.student_id === entityId)
      : (src.students || []);

    studentList.forEach(s => {
      const studentGraphId = addNode('Student', s.student_id, s.full_name, {
        student_id: s.student_id,
        reg_no: s.reg_no,
        branch: s.branch,
        course: s.course,
        year: s.year_of_study
      });

      // Active Room Allocation
      const alloc = (src.roomAllocations || []).find(a => a.student_id === s.student_id && a.status === 'Active');
      if (alloc && alloc.room_id) {
        const roomGraphId = getNodeGraphId('Room', alloc.room_id);
        addEdge(studentGraphId, roomGraphId, 'ALLOCATED_TO', { allocation_date: alloc.allocation_date });
      }

      // Active Mess Registration
      const mreg = (src.messRegistrations || []).find(r => r.student_id === s.student_id && r.status === 'Active');
      if (mreg && mreg.mess_id) {
        const messGraphId = getNodeGraphId('Mess', mreg.mess_id);
        addEdge(studentGraphId, messGraphId, 'REGISTERED_FOR', { registration_date: mreg.registration_date });
      }
    });

    // F. ALL Complaints
    (src.complaints || []).forEach(c => {
      const ct = (src.complaintTypes || []).find(t => t.complaint_type_id === c.complaint_type_id);
      const complaintGraphId = addNode('Complaint', c.complaint_id, `Grievance #${c.complaint_id}`, {
        complaint_id: c.complaint_id,
        status: c.status,
        description: c.description,
        complaint_date: c.complaint_date,
        category: ct?.category || 'General',
        type_name: ct?.type_name || 'General'
      });

      if (c.student_id) {
        const studentGraphId = getNodeGraphId('Student', c.student_id);
        addEdge(studentGraphId, complaintGraphId, 'FILED');
      }

      // Explicit Facility Links
      if (c.room_id) {
        const roomGraphId = getNodeGraphId('Room', c.room_id);
        addEdge(complaintGraphId, roomGraphId, 'ASSOCIATED_WITH');
      }
      if (c.mess_id) {
        const messGraphId = getNodeGraphId('Mess', c.mess_id);
        addEdge(complaintGraphId, messGraphId, 'ASSOCIATED_WITH');
      }
      if (c.hostel_id) {
        const hostelGraphId = getNodeGraphId('Hostel', c.hostel_id);
        addEdge(complaintGraphId, hostelGraphId, 'ASSOCIATED_WITH');
      }
    });

    // Payload validation: enforce 100% endpoint integrity before serialization
    const validated = validateGraphPayload(rawNodes, rawEdges);

    return res.json({
      neo4jConnected: false,
      elements: {
        nodes: validated.nodes,
        edges: validated.edges
      }
    });
  }

  // VIVA_NEO4J_CYPHER
  // 2. Live Cypher Graph Traversal for Cytoscape.js
  // Selects appropriate Cypher query based on entityType parameter:
  // - 'student': 2-hop radius around target student (room, hostel, mess, caterer, complaints)
  // - 'room': 2-hop radius around room (hostel hierarchy, active student allocations, complaints)
  // - 'mess': dining network (caterer, hostel location, registered students, complaints)
  // - default: comprehensive campus graph clustering messes and students up to limit
  // All queries employ OPTIONAL MATCH so missing relationships do not drop root nodes.
  try {
    let cypher = '';
    const params = { limit: neo.neo4j.int(limit) };

    if (entityType === 'student' && entityId) {
      params.studentId = entityId;
      cypher = `
        MATCH (s:Student {student_id: $studentId})
        OPTIONAL MATCH (s)-[r1:ALLOCATED_TO {status: 'Active'}]->(rm:Room)
        OPTIONAL MATCH (rm)-[r2:ON_FLOOR]->(f:Floor)-[r3:IN_BLOCK]->(b:Block)-[r4:PART_OF]->(h:Hostel)
        OPTIONAL MATCH (s)-[r5:REGISTERED_FOR {status: 'Active'}]->(m:Mess)-[r6:SERVED_BY]->(cat:Caterer)
        OPTIONAL MATCH (s)-[r7:FILED]->(c:Complaint)
        OPTIONAL MATCH (c)-[r8:ASSOCIATED_WITH]->(fac)
        RETURN s, rm, f, b, h, m, cat, c, fac, r1, r2, r3, r4, r5, r6, r7, r8
      `;
    } else if (entityType === 'room' && entityId) {
      params.roomId = entityId;
      cypher = `
        MATCH (rm:Room {room_id: $roomId})
        OPTIONAL MATCH (s:Student)-[r1:ALLOCATED_TO {status: 'Active'}]->(rm)
        OPTIONAL MATCH (rm)-[r2:ON_FLOOR]->(f:Floor)-[r3:IN_BLOCK]->(b:Block)-[r4:PART_OF]->(h:Hostel)
        OPTIONAL MATCH (c:Complaint)-[r5:ASSOCIATED_WITH]->(rm)
        RETURN rm, s, f, b, h, c, r1, r2, r3, r4, r5
      `;
    } else if (entityType === 'mess' && entityId) {
      params.messId = entityId;
      cypher = `
        MATCH (m:Mess {mess_id: $messId})
        OPTIONAL MATCH (m)-[r1:SERVED_BY]->(cat:Caterer)
        OPTIONAL MATCH (m)-[r2:LOCATED_AT]->(h:Hostel)
        OPTIONAL MATCH (s:Student)-[r3:REGISTERED_FOR {status: 'Active'}]->(m)
        OPTIONAL MATCH (c:Complaint)-[r4:ASSOCIATED_WITH]->(m)
        RETURN m, cat, h, s, c, r1, r2, r3, r4
        LIMIT $limit
      `;
    } else {
      // General subgraph exploration with comprehensive entity clustering
      cypher = `
        MATCH (m:Mess)
        OPTIONAL MATCH (m)-[r6:SERVED_BY]->(cat:Caterer)
        OPTIONAL MATCH (m)-[r_loc:LOCATED_AT]->(h_m:Hostel)
        WITH collect({m: m, cat: cat, h_m: h_m, r6: r6, r_loc: r_loc}) AS messCluster
        MATCH (s:Student)
        OPTIONAL MATCH (s)-[r1:ALLOCATED_TO {status: 'Active'}]->(rm:Room)
        OPTIONAL MATCH (rm)-[r2:ON_FLOOR]->(f:Floor)-[r3:IN_BLOCK]->(b:Block)-[r4:PART_OF]->(h:Hostel)
        OPTIONAL MATCH (s)-[r5:REGISTERED_FOR {status: 'Active'}]->(m:Mess)
        OPTIONAL MATCH (s)-[r7:FILED]->(c:Complaint)
        OPTIONAL MATCH (c)-[r8:ASSOCIATED_WITH]->(fac)
        RETURN s, rm, f, b, h, m, c, fac, r1, r2, r3, r4, r5, r7, r8, messCluster
        LIMIT $limit
      `;
    }

    const records = await neo.readQuery(cypher, params);
    const nodesMap = new Map();
    const edgesMap = new Map();

    function registerNode(nodeObj, typeName) {
      if (!nodeObj) return null;
      let rawId = null;
      if (typeName === 'Student') rawId = nodeObj.student_id;
      else if (typeName === 'Room') rawId = nodeObj.room_id;
      else if (typeName === 'Mess') rawId = nodeObj.mess_id;
      else if (typeName === 'Hostel') rawId = nodeObj.hostel_id;
      else if (typeName === 'Caterer') rawId = nodeObj.caterer_id;
      else if (typeName === 'Complaint') rawId = nodeObj.complaint_id;
      else if (typeName === 'Block') rawId = nodeObj.block_id;
      else if (typeName === 'Floor') rawId = nodeObj.floor_id;
      else if (typeName === 'RoomType') rawId = nodeObj.room_type_id;

      if (rawId === undefined || rawId === null) {
        rawId = nodeObj.student_id ?? nodeObj.room_id ?? nodeObj.mess_id ?? nodeObj.hostel_id ?? nodeObj.caterer_id ?? nodeObj.complaint_id ?? nodeObj.id;
      }
      if (rawId === undefined || rawId === null) return null;

      const graphId = getNodeGraphId(typeName, rawId);
      if (!nodesMap.has(graphId)) {
        let label = nodeObj.full_name || nodeObj.room_number || nodeObj.hostel_name || nodeObj.mess_name || nodeObj.caterer_name || (nodeObj.complaint_id ? `Grievance #${nodeObj.complaint_id}` : 'Node');
        if (typeName === 'Room' && !String(label).startsWith('Room')) label = `Room ${label}`;
        nodesMap.set(graphId, {
          data: {
            id: graphId,
            label,
            type: typeName,
            ...nodeObj
          }
        });
      }
      return graphId;
    }

    function registerEdge(sourceId, targetId, relType, extra = {}) {
      if (!sourceId || !targetId || !relType) return;
      if (!nodesMap.has(sourceId) || !nodesMap.has(targetId)) {
        console.warn(`[Live Graph] Excluded edge ${sourceId} -[:${relType}]-> ${targetId}: endpoint missing from nodeMap`);
        return;
      }
      const edgeId = getEdgeGraphId(sourceId, relType, targetId);
      if (!edgesMap.has(edgeId)) {
        edgesMap.set(edgeId, {
          data: {
            id: edgeId,
            source: sourceId,
            target: targetId,
            label: relType,
            ...extra
          }
        });
      }
    }

    records.forEach(row => {
      // If messCluster exists, register all mess and caterer nodes
      if (Array.isArray(row.messCluster)) {
        row.messCluster.forEach(mc => {
          const mId = registerNode(mc.m, 'Mess');
          const catId = registerNode(mc.cat, 'Caterer');
          const hId = registerNode(mc.h_m, 'Hostel');
          if (mId && catId) registerEdge(mId, catId, 'SERVED_BY');
          if (mId && hId) registerEdge(mId, hId, 'LOCATED_AT');
        });
      }

      const sId = registerNode(row.s, 'Student');
      const rmId = registerNode(row.rm, 'Room');
      const hId = registerNode(row.h, 'Hostel');
      const mId = registerNode(row.m, 'Mess');
      const catId = registerNode(row.cat, 'Caterer');
      const cId = registerNode(row.c, 'Complaint');
      const facId = registerNode(row.fac, row.fac?._labels?.[0] || 'Facility');

      if (sId && rmId) registerEdge(sId, rmId, 'ALLOCATED_TO');
      if (rmId && hId) registerEdge(rmId, hId, 'PART_OF');
      if (sId && mId) registerEdge(sId, mId, 'REGISTERED_FOR');
      if (mId && catId) registerEdge(mId, catId, 'SERVED_BY');
      if (mId && hId) registerEdge(mId, hId, 'LOCATED_AT');
      if (sId && cId) registerEdge(sId, cId, 'FILED');
      if (cId && facId) registerEdge(cId, facId, 'ASSOCIATED_WITH');
    });

    const rawNodes = Array.from(nodesMap.values());
    const rawEdges = Array.from(edgesMap.values());
    const validated = validateGraphPayload(rawNodes, rawEdges);

    res.json({
      neo4jConnected: true,
      elements: {
        nodes: validated.nodes,
        edges: validated.edges
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ==============================================================================
// 7. ADMINISTRATIVE DATA SYNCHRONIZATION
// ==============================================================================

// VIVA_NEO4J_SYNC
// VIVA_NEO4J_API
/**
 * PURPOSE:
 *   HTTP administrative endpoint to trigger full synchronization from MySQL to Neo4j.
 *   Executes the idempotent syncETL pipeline in backend/scripts/sync-falkordb.js.
 *
 * ENTRY POINT:
 *   POST /api/graph/sync
 *
 * TRIGGER:
 *   Called either manually by administrators via the Graph Overview dashboard button,
 *   or programmatically by post-migration scripts.
 *
 * RETURN VALUE:
 *   {
 *     success: true,
 *     timestamp: "2026-10-28T14:00:00.000Z",
 *     counts: {
 *       nodes: { hostels: 2, blocks: 4, rooms: 12, students: 20, messes: 5, ... },
 *       relationships: { ALLOCATED_TO: 18, REGISTERED_FOR: 20, ... }
 *     }
 *   }
 *
 * VIVA 20-SECOND EXPLANATION:
 *   "This POST endpoint triggers our idempotent ETL script from the web UI. It reads all active
 *   relational records from MySQL, merges them into Neo4j using Cypher MERGE commands, and
 *   returns an audited count of updated nodes and relationships without restarting the server."
 *
 * DEMONSTRATION SEARCH:
 *   Ctrl + Shift + F -> VIVA_NEO4J_SYNC
 */
router.post('/sync', async (req, res) => {
  try {
    const result = await syncDatabaseToGraph();
    res.json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
      suggestion: 'Ensure FalkorDB is running and connection parameters in backend/.env are correct.'
    });
  }
});

module.exports = router;

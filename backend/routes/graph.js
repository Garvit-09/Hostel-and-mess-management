// routes/graph.js – Neo4j Graph Intelligence REST API
// Implements Roommates, Grievance Hotspots, Smart Vacancy, Mess Connections, and Interactive Explorer
const express = require('express');
const router = express.Router();
const pool = require('../db');
const neo = require('../neo4j');
const { syncDatabaseToGraph, fetchSourceData } = require('../scripts/sync-neo4j');
const { getNodeGraphId, getEdgeGraphId, validateGraphPayload } = require('../graph-utils');

// Middleware to check Neo4j health before graph queries
async function ensureNeo4j(req, res, next) {
  try {
    const health = await neo.checkHealth();
    if (!health.connected) {
      req.neo4jConnected = false;
      req.neo4jError = health.message || health.error;
    } else {
      req.neo4jConnected = true;
      req.neo4jHealth = health;
    }
  } catch (err) {
    req.neo4jConnected = false;
    req.neo4jError = err.message;
  }
  next();
}

router.use(ensureNeo4j);

// ==============================================================================
// 1. HEALTH & METRICS
// ==============================================================================

// GET /api/graph/health - Live health status of Neo4j driver and schema
router.get('/health', async (req, res) => {
  const health = await neo.checkHealth();
  const dbStatus = pool.getEngineStatus ? pool.getEngineStatus() : { engineName: 'MySQL 8.0' };
  res.json({
    neo4j: health,
    mysql: {
      status: 'online',
      engine: dbStatus.engineName,
      isFallback: dbStatus.isFallback
    },
    hybridArchitecture: 'Active (MySQL Primary Transactional + Neo4j Graph Intelligence)'
  });
});

// GET /api/graph/overview - High-level graph intelligence KPIs
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

// GET /api/graph/students/:studentId/roommates - Current active roommates
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

// GET /api/graph/students/:studentId/history - Historical roommate analysis
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

// GET /api/graph/students/:studentId/roommates-graph - Interactive Cytoscape graph for roommates & room hierarchy
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

// GET /api/graph/complaint-hotspots - Facility rankings with recurring complaints
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

// GET /api/graph/hotspots-graph - Hotspot relationship graph with intensity heat mapping
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
// 4. FEATURE 3: SMART ROOM & VACANCY FINDER (NEO4J DISCOVERY + MYSQL VALIDATION)
// ==============================================================================

// GET /api/graph/rooms/available - Graph traversal candidates cross-validated with MySQL
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

// GET /api/graph/mess/:messId/connections - Explores mess, caterer, students & linked complaints
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

// GET /api/graph/mess/:messId/graph - Dedicated interactive Cytoscape graph for dining supply & student network
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

// GET /api/graph/explore - Cytoscape.js ready nodes and edges format
router.get('/explore', async (req, res) => {
  const entityType = (req.query.type || 'all').toLowerCase(); // all, student, room, mess, hostel, complaint
  const entityId = req.query.id ? Number(req.query.id) : null;
  const limit = Math.min(Number(req.query.limit) || 60, 100);

  // 1. Fallback graph topology generator if Neo4j is offline
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

  // 2. Live Cypher Graph Traversal for Cytoscape.js
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
      const rawId = nodeObj.student_id ?? nodeObj.room_id ?? nodeObj.hostel_id ?? nodeObj.mess_id ?? nodeObj.caterer_id ?? nodeObj.complaint_id ?? nodeObj.id;
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

// POST /api/graph/sync - Trigger idempotent database sync to Neo4j
router.post('/sync', async (req, res) => {
  try {
    const result = await syncDatabaseToGraph();
    res.json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
      suggestion: 'Ensure Neo4j is running and connection parameters in backend/.env are correct.'
    });
  }
});

module.exports = router;

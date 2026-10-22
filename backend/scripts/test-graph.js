// test-graph.js – Automated Verification Suite for Neo4j Graph Intelligence & Regression Tests
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const http = require('http');
const pool = require('../db');
const neo = require('../neo4j');
const { fetchSourceData, syncDatabaseToGraph } = require('./sync-neo4j');
const {
  getNodeGraphId,
  getEdgeGraphId,
  validateGraphPayload,
  validateMessRegistrationsIntegrity,
  validateRoomAllocationsIntegrity
} = require('../graph-utils');

async function runTests() {
  console.log('=======================================================');
  console.log('RUNNING NEO4J GRAPH INTELLIGENCE & REGRESSION TEST SUITE');
  console.log('=======================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition, description) {
    if (condition) {
      console.log(`  ✅ PASS: ${description}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${description}`);
      failed++;
    }
  }

  // 1. Authoritative Source Extraction Test
  console.log('\n[Test 1] Extracting Authoritative Relational Data...');
  try {
    const src = await fetchSourceData();
    assert(src.students.length >= 10, `Loaded ${src.students.length} students (>= 10 expected)`);
    assert(src.rooms.length >= 8, `Loaded ${src.rooms.length} rooms (>= 8 expected)`);
    assert(src.complaints.length >= 5, `Loaded ${src.complaints.length} complaints (>= 5 expected)`);
    assert(src.messes.length >= 5, `Loaded ${src.messes.length} messes (including Mess 5)`);

    // Verify facility links exist and are valid
    const linked = src.complaints.filter(c => c.room_id || c.mess_id || c.hostel_id);
    const unlinked = src.complaints.filter(c => !c.room_id && !c.mess_id && !c.hostel_id);
    assert(linked.length > 0, `Explicit facility links present (${linked.length} linked complaints)`);
    assert(unlinked.length > 0, `Unlinked complaints preserved transparently (${unlinked.length} unlinked complaints)`);
  } catch (err) {
    assert(false, `Source extraction failed: ${err.message}`);
  }

  // 2. Neo4j Connectivity & Graceful Handling Test
  console.log('\n[Test 2] Testing Neo4j Connection & Graceful Degradation...');
  try {
    const health = await neo.checkHealth();
    assert(health !== null, 'Health check returned structured response');
    if (health.connected) {
      console.log(`  ℹ️ Live Neo4j instance detected at ${health.uri} (Latency: ${health.latencyMs}ms)`);
      assert(typeof health.nodeCount === 'number', `Node count reported: ${health.nodeCount}`);

      // 3. Idempotent Synchronization Test
      console.log('\n[Test 3] Testing Idempotency of ETL Synchronization...');
      const firstSync = await syncDatabaseToGraph();
      assert(firstSync.success === true, 'First synchronization succeeded');

      const secondSync = await syncDatabaseToGraph();
      assert(secondSync.success === true, 'Second synchronization succeeded');

      // Verify node counts did not duplicate
      const [nodeRes] = await neo.readQuery('MATCH (n:Student) RETURN count(n) AS studentCount');
      assert(nodeRes.studentCount === 12, `Student node count is exactly 12 after repeated sync (got ${nodeRes.studentCount})`);

      // 4. Live Roommate Cypher Query Test
      console.log('\n[Test 4] Testing Roommate Discovery via Cypher...');
      const roommateRes = await neo.readQuery(`
        MATCH (s:Student {student_id: 1})-[a1:ALLOCATED_TO {status: 'Active'}]->(r:Room)
        OPTIONAL MATCH (rm:Student)-[a2:ALLOCATED_TO {status: 'Active'}]->(r)
        WHERE rm.student_id <> s.student_id
        RETURN s.full_name AS student, r.room_number AS room, collect(rm.full_name) AS roommates
      `);
      assert(roommateRes.length === 1, 'Found active room allocation for Student 1');
      assert(roommateRes[0].room === 'G01', `Student 1 allocated to Room G01 (got ${roommateRes[0].room})`);
      assert(roommateRes[0].roommates.includes('Aarav Sharma'), 'Identified Aarav Sharma as active roommate');
      assert(!roommateRes[0].roommates.includes('Aditya Sen'), 'Student is not listed as their own roommate');

      // 5. Hotspot Cypher Query Test
      console.log('\n[Test 5] Testing Grievance Hotspot Detection via Cypher...');
      const hotspotRes = await neo.readQuery(`
        MATCH (c:Complaint)-[:ASSOCIATED_WITH]->(fac)
        RETURN labels(fac)[0] AS facType, coalesce(fac.room_number, fac.mess_name, fac.hostel_name) AS facName, count(c) AS compCount
        ORDER BY compCount DESC
      `);
      assert(hotspotRes.length > 0, `Identified ${hotspotRes.length} complaint hotspots in graph`);
    } else {
      console.log(`  ℹ️ Live Neo4j not running (${health.message || health.error}). Verified graceful offline degradation.`);
      assert(health.status === 'unconfigured' || health.status === 'disconnected', 'Status accurately reported as unconfigured/disconnected');
    }
  } catch (err) {
    assert(false, `Neo4j check error: ${err.message}`);
  }

  // 6. MySQL Vacancy Validation Rule Test
  console.log('\n[Test 6] Testing Rule: MySQL is Final Authority for Vacancy...');
  try {
    const src = await fetchSourceData();
    const room1 = src.rooms.find(r => r.room_id === 1);
    const rt1 = src.roomTypes.find(t => t.room_type_id === room1.room_type_id);
    const allocs = src.roomAllocations.filter(a => a.room_id === 1 && a.status === 'Active');
    const vacant = Math.max(0, rt1.capacity - allocs.length);
    assert(vacant === 0, `Room G01 capacity ${rt1.capacity}, active allocations ${allocs.length} => Vacant beds = ${vacant}`);
  } catch (err) {
    assert(false, `Vacancy check error: ${err.message}`);
  }

  // ============================================================================
  // REGRESSION TESTS FOR GRAPH EXPLORER BUG & PAYLOAD INTEGRITY
  // ============================================================================

  console.log('\n[Regression 1] Valid Student-Mess Registration Node & Edge Creation...');
  try {
    const testNodes = [
      { data: { id: getNodeGraphId('Student', 5), label: 'Ananya Patel', type: 'Student' } },
      { data: { id: getNodeGraphId('Mess', 5), label: 'Block D Dining - Non-Veg', type: 'Mess' } }
    ];
    const testEdges = [
      { data: { id: getEdgeGraphId('student_5', 'REGISTERED_FOR', 'mess_5'), source: 'student_5', target: 'mess_5', label: 'REGISTERED_FOR' } }
    ];
    const res = validateGraphPayload(testNodes, testEdges);
    assert(res.nodes.length === 2, 'Both student_5 and mess_5 nodes are retained');
    assert(res.edges.length === 1, 'Edge student_5_REGISTERED_FOR_mess_5 is retained with valid endpoints');
    assert(res.droppedCount === 0, 'No dropped edges when both endpoints exist');
  } catch (err) {
    assert(false, `Regression 1 error: ${err.message}`);
  }

  console.log('\n[Regression 2] Missing Mess Cannot Produce a Dangling Edge...');
  try {
    const testNodes = [
      { data: { id: 'student_5', label: 'Ananya Patel', type: 'Student' } }
    ];
    // Edge points to nonexistent mess_999
    const testEdges = [
      { data: { id: 'student_5_REGISTERED_FOR_mess_999', source: 'student_5', target: 'mess_999', label: 'REGISTERED_FOR' } }
    ];
    const res = validateGraphPayload(testNodes, testEdges);
    assert(res.edges.length === 0, 'Dangling edge targeting nonexistent mess_999 was safely excluded');
    assert(res.droppedCount === 1, 'Dropped count accurately reflects 1 invalid edge');
    assert(res.nodes.length === 1, 'Valid student node remains unharmed in payload');
  } catch (err) {
    assert(false, `Regression 2 error: ${err.message}`);
  }

  console.log('\n[Regression 3] Missing Student Cannot Produce a Dangling Edge...');
  try {
    const testNodes = [
      { data: { id: 'mess_5', label: 'Block D Dining - Non-Veg', type: 'Mess' } }
    ];
    // Edge points from nonexistent student_999
    const testEdges = [
      { data: { id: 'student_999_REGISTERED_FOR_mess_5', source: 'student_999', target: 'mess_5', label: 'REGISTERED_FOR' } }
    ];
    const res = validateGraphPayload(testNodes, testEdges);
    assert(res.edges.length === 0, 'Dangling edge with nonexistent source student_999 was safely excluded');
    assert(res.droppedCount === 1, 'Dropped count accurately reflects 1 invalid edge');
    assert(res.nodes.length === 1, 'Valid mess node remains unharmed in payload');
  } catch (err) {
    assert(false, `Regression 3 error: ${err.message}`);
  }

  console.log('\n[Regression 4] Different Database Entity IDs Do Not Collide...');
  try {
    const studentId = getNodeGraphId('Student', 1);
    const messId = getNodeGraphId('Mess', 1);
    const roomId = getNodeGraphId('Room', 1);
    const hostelId = getNodeGraphId('Hostel', 1);
    const catererId = getNodeGraphId('Caterer', 1);
    const complaintId = getNodeGraphId('Complaint', 1);

    const ids = [studentId, messId, roomId, hostelId, catererId, complaintId];
    const uniqueIds = new Set(ids);
    assert(uniqueIds.size === 6, `All 6 entity types with ID=1 have unique graph IDs: ${Array.from(uniqueIds).join(', ')}`);
    assert(studentId === 'student_1' && messId === 'mess_1' && roomId === 'room_1', 'Canonical lowercase prefix enforced correctly');
  } catch (err) {
    assert(false, `Regression 4 error: ${err.message}`);
  }

  console.log('\n[Regression 5] Re-running Synchronization / Payload Processing Does Not Duplicate...');
  try {
    const testNodes = [
      { data: { id: 'student_1', label: 'Student 1', type: 'Student' } },
      { data: { id: 'student_1', label: 'Student 1 Duplicate', type: 'Student' } }
    ];
    const testEdges = [
      { data: { id: 'student_1_ALLOCATED_TO_room_1', source: 'student_1', target: 'room_1', label: 'ALLOCATED_TO' } },
      { data: { id: 'student_1_ALLOCATED_TO_room_1', source: 'student_1', target: 'room_1', label: 'ALLOCATED_TO' } }
    ];
    // Add room_1 node
    testNodes.push({ data: { id: 'room_1', label: 'Room G01', type: 'Room' } });

    const res = validateGraphPayload(testNodes, testEdges);
    assert(res.nodes.length === 2, `Deduplicated node count is exactly 2 (got ${res.nodes.length})`);
    assert(res.edges.length === 1, `Deduplicated edge count is exactly 1 (got ${res.edges.length})`);
  } catch (err) {
    assert(false, `Regression 5 error: ${err.message}`);
  }

  console.log('\n[Regression 6] Inactive vs Active Registration Status Handling...');
  try {
    const sampleStudents = [{ student_id: 1 }, { student_id: 2 }];
    const sampleMesses = [{ mess_id: 1 }, { mess_id: 2 }];
    const sampleRegistrations = [
      { mess_reg_id: 1, student_id: 1, mess_id: 1, status: 'Active' },
      { mess_reg_id: 2, student_id: 1, mess_id: 2, status: 'Ended' }, // Old ended subscription
      { mess_reg_id: 3, student_id: 2, mess_id: 999, status: 'Active' } // Invalid foreign key
    ];

    const { validRegistrations, invalidRegistrations } = validateMessRegistrationsIntegrity(
      sampleRegistrations,
      sampleStudents,
      sampleMesses
    );

    assert(validRegistrations.length === 2, `Valid registrations: 2 identified (Active and Ended)`);
    assert(invalidRegistrations.length === 1, `Invalid registration with mess_id 999 rejected`);
    assert(validRegistrations.find(r => r.status === 'Ended').mess_id === 2, 'Ended status preserved accurately');
  } catch (err) {
    assert(false, `Regression 6 error: ${err.message}`);
  }

  console.log('\n[Regression 7] Incomplete Graph Payload Does Not Crash Graph Processor...');
  try {
    // Pass corrupted/empty nodes and edges
    const res1 = validateGraphPayload(null, null);
    assert(res1.nodes.length === 0 && res1.edges.length === 0, 'Handled null payload safely without throwing');

    const res2 = validateGraphPayload([], [{ data: { source: '', target: '' } }]);
    assert(res2.edges.length === 0, 'Handled malformed edge safely without throwing');
  } catch (err) {
    assert(false, `Regression 7 error: ${err.message}`);
  }

  console.log('\n[Regression 8] One Invalid Edge Does Not Suppress Valid Edges...');
  try {
    const testNodes = [
      { data: { id: 'student_1', label: 'Aditya', type: 'Student' } },
      { data: { id: 'room_1', label: 'Room G01', type: 'Room' } },
      { data: { id: 'mess_1', label: 'Mess A', type: 'Mess' } }
    ];
    const testEdges = [
      { data: { id: 'student_1_ALLOCATED_TO_room_1', source: 'student_1', target: 'room_1', label: 'ALLOCATED_TO' } },
      { data: { id: 'student_1_REGISTERED_FOR_mess_1', source: 'student_1', target: 'mess_1', label: 'REGISTERED_FOR' } },
      { data: { id: 'student_1_INVALID_TARGET_ghost_9', source: 'student_1', target: 'ghost_9', label: 'INVALID' } } // 1 bad edge
    ];
    const res = validateGraphPayload(testNodes, testEdges);
    assert(res.edges.length === 2, `Preserved exactly 2 valid edges while dropping 1 bad edge (got ${res.edges.length})`);
    assert(res.droppedCount === 1, `Dropped count is exactly 1`);
  } catch (err) {
    assert(false, `Regression 8 error: ${err.message}`);
  }

  console.log('\n[Regression 9] Live Endpoint Validation: Every Edge References Existing Nodes in Payload...');
  try {
    const exploreRes = await new Promise((resolve, reject) => {
      http.get('http://localhost:4000/api/graph/explore', res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve(JSON.parse(body)));
      }).on('error', reject);
    });

    const elements = exploreRes.elements;
    assert(elements !== undefined, 'Explore endpoint returned valid elements object');
    const nodes = elements.nodes || [];
    const edges = elements.edges || [];

    assert(nodes.length > 0, `Graph Explorer returned ${nodes.length} nodes`);
    assert(edges.length > 0, `Graph Explorer returned ${edges.length} edges`);

    // Verify mess_5 is present in nodes!
    const mess5Node = nodes.find(n => n.data.id === 'mess_5');
    assert(mess5Node !== undefined, 'Target node `mess_5` is explicitly present in the graph nodes collection');

    // Verify student_5 is present in nodes
    const student5Node = nodes.find(n => n.data.id === 'student_5');
    assert(student5Node !== undefined, 'Source node `student_5` is present in the graph nodes collection');

    // Verify student_5 -> mess_5 edge exists and has valid endpoints
    const student5Mess5Edge = edges.find(e => e.data.source === 'student_5' && e.data.target === 'mess_5');
    assert(student5Mess5Edge !== undefined, 'Edge `student_5_REGISTERED_FOR_mess_5` exists with valid source & target');

    // Verify 100% of all edges in returned payload have source and target in nodes
    const nodeIds = new Set(nodes.map(n => n.data.id));
    let danglingCount = 0;
    for (const edge of edges) {
      if (!nodeIds.has(edge.data.source) || !nodeIds.has(edge.data.target)) {
        danglingCount++;
        console.error(`  Dangling edge found: ${edge.data.id} (source: ${edge.data.source}, target: ${edge.data.target})`);
      }
    }
    assert(danglingCount === 0, `100% of returned edges (${edges.length}) have existing source and target in nodes collection (0 dangling)`);

  } catch (err) {
    assert(false, `Regression 9 error: ${err.message}`);
  }

  console.log('\n=======================================================');
  console.log(`TOTAL TEST SUMMARY: ${passed} Passed, ${failed} Failed.`);
  console.log('=======================================================');
  await neo.closeDriver();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

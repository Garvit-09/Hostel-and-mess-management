// graph-utils.js – Canonical Graph Identifiers, Integrity Validation & Payload Verifier
// Enforces consistent node/edge ID generation, foreign-key integrity, and Cytoscape.js contract safety.

// ==============================================================================
// VIVA_NEO4J_SCHEMA: CANONICAL GRAPH IDENTIFIER GENERATORS
// VIVA_NEO4J_DATA_VALIDATION: CROSS-ENTITY NAMESPACING TO PREVENT ID COLLISIONS
// Purpose: Produces consistent, collision-free identifiers for graph nodes and edges across heterogeneous entities.
// Entry point: getNodeGraphId(type, id) & getEdgeGraphId(sourceId, relType, targetId)
// Input: Entity type (e.g., 'Student', 'Mess', 'Room') and relational primary key ID.
// Logic: Normalizes type to lowercase and appends underscore followed by ID (e.g., 'student_5', 'mess_5', 'room_3'). Edges join source, relType, target.
// Neo4j role: Prevents collision when Student with ID 5 and Mess with ID 5 are both plotted in Cytoscape.js graph canvas.
// MySQL role: Maps integer relational surrogate keys into globally unique graph string identifiers.
// Output: Canonical string ID (e.g., 'student_5') or null if invalid inputs.
// Viva explanation: "In a relational schema, different tables have overlapping primary keys—Student ID 1, Room ID 1, and Mess ID 1 all exist. The getNodeGraphId utility creates namespaced canonical graph IDs like student_1 and mess_1. This ensures unique node keys in Cytoscape.js and eliminates ambiguous edge references."
// Demonstration search: VIVA_NEO4J_SCHEMA
// ==============================================================================

/**
 * Generates a canonical, lowercase-prefixed graph node identifier.
 * Example: getNodeGraphId('Student', 5) => 'student_5'
 * Example: getNodeGraphId('Mess', 5) => 'mess_5'
 * Example: getNodeGraphId('Room', 3) => 'room_3'
 */
function getNodeGraphId(type, id) {
  if (!type || id === undefined || id === null) return null;
  const cleanType = String(type).trim().toLowerCase();
  const cleanId = String(id).trim();
  return `${cleanType}_${cleanId}`;
}

/**
 * Generates a canonical relationship identifier.
 * Example: getEdgeGraphId('student_5', 'REGISTERED_FOR', 'mess_5')
 *       => 'student_5_REGISTERED_FOR_mess_5'
 */
function getEdgeGraphId(sourceId, relType, targetId) {
  if (!sourceId || !relType || !targetId) return null;
  return `${sourceId}_${relType}_${targetId}`;
}

// ==============================================================================
// VIVA_NEO4J_FRONTEND: CYTOSCAPE.JS GRAPH PAYLOAD CONTRACT VALIDATOR
// VIVA_NEO4J_DATA_VALIDATION: DANGLING EDGE PURGE & INTEGRITY ASSURANCE
// Purpose: Validates graph payloads before serialization to Cytoscape.js, eliminating dangling edges and duplicate nodes.
// Entry point: validateGraphPayload(rawNodes, rawEdges)
// Input: Arrays of raw node and edge definitions intended for Cytoscape.js.
// Logic:
//   1. Builds Map of valid unique nodes by ID.
//   2. Checks every edge's source and target against the node Map.
//   3. Drops any edge where source or target node is missing, logging details for diagnostics.
//   4. Enforces edge ID uniqueness using a Set.
// Neo4j role: Cytoscape.js crashes entirely if an edge references a nonexistent node ID; this provides absolute client safety.
// MySQL role: Catches data mismatches where relational rows have soft-deleted endpoints or orphaned foreign keys.
// Output: Sanitized object { nodes: Array, edges: Array, droppedCount: Number, droppedDetails: Array }.
// Viva explanation: "Cytoscape.js requires that every edge connect two nodes that actually exist in the elements array. If an edge has a missing endpoint—called a dangling edge—the Cytoscape renderer throws an exception and displays a blank canvas. validateGraphPayload acts as an integrity barrier: it verifies that both source and target exist, deduplicates elements, and drops invalid edges before the JSON response is sent to the browser."
// Demonstration search: VIVA_NEO4J_FRONTEND
// ==============================================================================
function validateGraphPayload(rawNodes = [], rawEdges = []) {
  const safeNodes = Array.isArray(rawNodes) ? rawNodes : [];
  const safeEdges = Array.isArray(rawEdges) ? rawEdges : [];
  const nodeMap = new Map();
  const validNodes = [];

  // 1. Deduplicate & validate nodes
  for (const node of safeNodes) {
    if (!node || !node.data || !node.data.id) continue;
    const id = String(node.data.id).trim();
    if (!nodeMap.has(id)) {
      nodeMap.set(id, {
        ...node,
        data: {
          ...node.data,
          id
        }
      });
      validNodes.push(nodeMap.get(id));
    }
  }

  // 2. Validate edges against nodeMap
  const validEdges = [];
  const edgeSet = new Set();
  const droppedDetails = [];

  for (const edge of safeEdges) {
    if (!edge || !edge.data) continue;
    const source = String(edge.data.source || '').trim();
    const target = String(edge.data.target || '').trim();
    const label = String(edge.data.label || 'CONNECTED_TO').trim();

    if (!source || !target) {
      droppedDetails.push({
        id: edge.data.id || 'unknown',
        source,
        target,
        label,
        reason: 'Empty source or target identifier'
      });
      continue;
    }

    const hasSource = nodeMap.has(source);
    const hasTarget = nodeMap.has(target);

    if (!hasSource || !hasTarget) {
      droppedDetails.push({
        id: edge.data.id || `${source}_${label}_${target}`,
        source,
        target,
        label,
        reason: `Missing endpoint node(s) — source (${source}) exists: ${hasSource}, target (${target}) exists: ${hasTarget}`
      });
      continue;
    }

    const edgeId = edge.data.id || getEdgeGraphId(source, label, target);
    if (edgeSet.has(edgeId)) {
      // Duplicate edge, skip silently
      continue;
    }

    edgeSet.add(edgeId);
    validEdges.push({
      ...edge,
      data: {
        ...edge.data,
        id: edgeId,
        source,
        target,
        label
      }
    });
  }

  if (droppedDetails.length > 0) {
    console.warn(`[Graph Payload Validator] Excluded ${droppedDetails.length} dangling/invalid edge(s):`,
      droppedDetails.map(d => `${d.id} (${d.reason})`).join('; ')
    );
  }

  return {
    nodes: validNodes,
    edges: validEdges,
    droppedCount: droppedDetails.length,
    droppedDetails
  };
}

// ==============================================================================
// VIVA_MESS_CONNECTION: PRE-FLIGHT INTEGRITY VALIDATION FOR STUDENT MESS REGISTRATIONS
// VIVA_NEO4J_DATA_VALIDATION: RELATIONAL FOREIGN KEY VERIFICATION BEFORE GRAPH INSERTION
// Purpose: Verifies that every student_id and mess_id in MessRegistration exists in the authoritative Student and Mess tables.
// Entry point: validateMessRegistrationsIntegrity(registrations, students, messes)
// Input: Raw rows from MySQL/Data Engine: registrations, students, messes.
// Logic: Builds fast in-memory Hash Sets of student IDs and mess IDs. Checks both foreign keys for each registration. Separates valid registrations from invalid/orphaned ones with explicit warnings.
// Neo4j role: Prevents Neo4j Cypher MATCH from failing silently or creating disconnected relationships.
// MySQL role: MySQL foreign keys enforce this at the database engine level; this pre-flight check protects ETL synchronization even if raw JSON data or test fixtures contain partial records.
// Output: Object { validRegistrations: Array, invalidRegistrations: Array }.
// Viva explanation: "Before pushing student mess subscriptions to Neo4j, validateMessRegistrationsIntegrity verifies that both the student and the mess exist in our authoritative relational datasets. If an orphan record is found, it is logged and skipped rather than creating a corrupt relationship in the graph."
// Demonstration search: VIVA_MESS_CONNECTION
// ==============================================================================
function validateMessRegistrationsIntegrity(registrations = [], students = [], messes = []) {
  const studentIds = new Set((students || []).map(s => Number(s.student_id)));
  const messIds = new Set((messes || []).map(m => Number(m.mess_id)));
  const valid = [];
  const invalid = [];

  for (const reg of registrations) {
    const sId = Number(reg.student_id);
    const mId = Number(reg.mess_id);
    const sExists = studentIds.has(sId);
    const mExists = messIds.has(mId);

    if (sExists && mExists) {
      valid.push(reg);
    } else {
      const err = `MessRegistration id=${reg.mess_reg_id}: student_id=${sId} (exists=${sExists}), mess_id=${mId} (exists=${mExists})`;
      console.warn(`[Integrity Check] Skipping invalid registration: ${err}`);
      invalid.push({ registration: reg, reason: err });
    }
  }

  return { validRegistrations: valid, invalidRegistrations: invalid };
}

// ==============================================================================
// VIVA_ROOMMATE_FINDER: PRE-FLIGHT INTEGRITY VALIDATION FOR ROOM ALLOCATIONS
// VIVA_NEO4J_DATA_VALIDATION: PREVENTS ORPHANED [:ALLOCATED_TO] EDGES
// Purpose: Confirms that every room allocation references valid student_id and room_id entities.
// Entry point: validateRoomAllocationsIntegrity(allocations, students, rooms)
// Input: Raw arrays of allocations, students, and rooms.
// Logic: Uses Sets for O(1) membership checks; ensures both ends of the ALLOCATED_TO edge exist in MySQL source tables before graph insertion.
// Neo4j role: Guarantees that ALLOCATED_TO edges always connect real Student nodes to real Room nodes.
// MySQL role: Reconciles relational RoomAllocation state with MySQL Student and Room parent tables.
// Output: Object { validAllocations: Array, invalidAllocations: Array }.
// Viva explanation: "In our Roommate Finder feature, peer relationships rely on ALLOCATED_TO edges between students and rooms. validateRoomAllocationsIntegrity guarantees that every allocation belongs to a real student and a real room before the ETL script executes MERGE in Neo4j, eliminating orphan edges."
// Demonstration search: VIVA_ROOMMATE_FINDER
// ==============================================================================
function validateRoomAllocationsIntegrity(allocations = [], students = [], rooms = []) {
  const studentIds = new Set((students || []).map(s => Number(s.student_id)));
  const roomIds = new Set((rooms || []).map(r => Number(r.room_id)));
  const valid = [];
  const invalid = [];

  for (const alloc of allocations) {
    const sId = Number(alloc.student_id);
    const rId = Number(alloc.room_id);
    const sExists = studentIds.has(sId);
    const rExists = roomIds.has(rId);

    if (sExists && rExists) {
      valid.push(alloc);
    } else {
      const err = `RoomAllocation id=${alloc.allocation_id}: student_id=${sId} (exists=${sExists}), room_id=${rId} (exists=${rExists})`;
      console.warn(`[Integrity Check] Skipping invalid room allocation: ${err}`);
      invalid.push({ allocation: alloc, reason: err });
    }
  }

  return { validAllocations: valid, invalidAllocations: invalid };
}

// ==============================================================================
// VIVA_GRIEVANCE_HOTSPOT: PRE-FLIGHT SANITIZATION OF COMPLAINT FACILITY LINKS
// VIVA_NEO4J_DATA_VALIDATION: VALIDATION OF EXPLICIT FOREIGN KEYS (ROOM, MESS, HOSTEL)
// Purpose: Validates that explicit facility foreign keys on Complaint (room_id, mess_id, hostel_id) point to valid facilities; safely clears broken foreign keys to null.
// Entry point: validateComplaintFacilityLinks(complaints, rooms, messes, hostels)
// Input: Raw complaint rows and facilities from MySQL.
// Logic: Checks each optional facility reference. If an ID does not exist in the corresponding facility Set, the link is sanitized to null and a warning is logged.
// Neo4j role: Ensures [:ASSOCIATED_WITH] edges are only established to verified facility nodes in Neo4j.
// MySQL role: Validates against migration_neo4j_facility_complaint.sql nullable foreign key columns.
// Output: Object { sanitizedComplaints: Array, warnings: Array }.
// Viva explanation: "Complaints can be linked to a Room, a Mess hall, or a Hostel block, or remain general campus grievances with null facility keys. validateComplaintFacilityLinks verifies that any linked facility ID actually exists in MySQL before the synchronization pipeline creates ASSOCIATED_WITH relationships in Neo4j."
// Demonstration search: VIVA_GRIEVANCE_HOTSPOT
// ==============================================================================
function validateComplaintFacilityLinks(complaints = [], rooms = [], messes = [], hostels = []) {
  const roomIds = new Set((rooms || []).map(r => Number(r.room_id)));
  const messIds = new Set((messes || []).map(m => Number(m.mess_id)));
  const hostelIds = new Set((hostels || []).map(h => Number(h.hostel_id)));
  const sanitized = [];
  const warnings = [];

  for (const c of complaints) {
    let roomId = c.room_id ? Number(c.room_id) : null;
    let messId = c.mess_id ? Number(c.mess_id) : null;
    let hostelId = c.hostel_id ? Number(c.hostel_id) : null;

    if (roomId && !roomIds.has(roomId)) {
      warnings.push(`Complaint #${c.complaint_id} references nonexistent room_id ${roomId}. Cleared link.`);
      roomId = null;
    }
    if (messId && !messIds.has(messId)) {
      warnings.push(`Complaint #${c.complaint_id} references nonexistent mess_id ${messId}. Cleared link.`);
      messId = null;
    }
    if (hostelId && !hostelIds.has(hostelId)) {
      warnings.push(`Complaint #${c.complaint_id} references nonexistent hostel_id ${hostelId}. Cleared link.`);
      hostelId = null;
    }

    sanitized.push({
      ...c,
      room_id: roomId,
      mess_id: messId,
      hostel_id: hostelId
    });
  }

  if (warnings.length > 0) {
    console.warn(`[Integrity Check] Sanitized ${warnings.length} complaint facility link(s):`, warnings.join('; '));
  }

  return { sanitizedComplaints: sanitized, warnings };
}

module.exports = {
  getNodeGraphId,
  getEdgeGraphId,
  validateGraphPayload,
  validateMessRegistrationsIntegrity,
  validateRoomAllocationsIntegrity,
  validateComplaintFacilityLinks
};

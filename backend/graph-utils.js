// graph-utils.js – Canonical Graph Identifiers, Integrity Validation & Payload Verifier
// Enforces consistent node/edge ID generation, foreign-key integrity, and Cytoscape.js contract safety.

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

/**
 * Validates a graph payload before serialization to Cytoscape.js / client.
 * Guarantees that:
 * 1. Every edge's source node exists in nodes
 * 2. Every edge's target node exists in nodes
 * 3. Every edge ID is unique and non-empty
 * 4. Node IDs are unique
 * 5. Invalid / dangling edges are safely excluded and diagnostically logged.
 *
 * @param {Array} rawNodes - [{ data: { id, label, type, ... } }]
 * @param {Array} rawEdges - [{ data: { id, source, target, label, ... } }]
 * @returns {Object} { nodes: Array, edges: Array, droppedCount: Number, droppedDetails: Array }
 */
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

/**
 * Pre-flight integrity validation for student-mess registrations.
 * Verifies that each registration's student_id and mess_id exist in authoritative source tables.
 *
 * @param {Array} registrations - raw messRegistrations rows
 * @param {Array} students - raw students rows
 * @param {Array} messes - raw messes rows
 * @returns {Object} { validRegistrations: Array, invalidRegistrations: Array }
 */
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

/**
 * Pre-flight integrity validation for student-room allocations.
 * Verifies that each allocation's student_id and room_id exist in authoritative source tables.
 */
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

/**
 * Pre-flight integrity validation for complaint facility links.
 * Verifies that explicit foreign keys (room_id, mess_id, hostel_id) point to real facilities.
 */
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

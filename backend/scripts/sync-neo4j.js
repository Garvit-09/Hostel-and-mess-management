// sync-neo4j.js – Idempotent ETL Synchronization Pipeline (MySQL/Fallback -> Neo4j)
// Preserves authoritative state, reconciles relationship mutations, and produces verified metrics.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../db');
const neo = require('../neo4j');
const {
  validateMessRegistrationsIntegrity,
  validateRoomAllocationsIntegrity,
  validateComplaintFacilityLinks
} = require('../graph-utils');

// Extract source tables from MySQL or Fallback Engine
async function fetchSourceData() {
  // If fallback engine is active or getRawData exists
  if (pool.getRawData && (pool.isFallback !== false || !process.env.DB_PASSWORD)) {
    const raw = pool.getRawData();
    return {
      students: raw.students || [],
      hostels: raw.hostels || [],
      blocks: raw.blocks || [],
      floors: raw.floors || [],
      roomTypes: raw.roomTypes || [],
      rooms: raw.rooms || [],
      roomAllocations: raw.roomAllocations || [],
      caterers: raw.caterers || [],
      messes: raw.messes || [],
      messRegistrations: raw.messRegistrations || [],
      complaintTypes: raw.complaintTypes || [],
      complaints: raw.complaints || []
    };
  }

  // Live MySQL extraction
  const [students] = await pool.query('SELECT * FROM Student');
  const [hostels] = await pool.query('SELECT * FROM Hostel');
  const [blocks] = await pool.query('SELECT * FROM Block');
  const [floors] = await pool.query('SELECT * FROM Floor');
  const [roomTypes] = await pool.query('SELECT * FROM RoomType');
  const [rooms] = await pool.query('SELECT * FROM Room');
  const [roomAllocations] = await pool.query('SELECT * FROM RoomAllocation');
  const [caterers] = await pool.query('SELECT * FROM Caterer');
  const [messes] = await pool.query('SELECT * FROM Mess');
  const [messRegistrations] = await pool.query('SELECT * FROM MessRegistration');
  const [complaintTypes] = await pool.query('SELECT * FROM ComplaintType');
  const [complaints] = await pool.query('SELECT * FROM Complaint');

  return {
    students,
    hostels,
    blocks,
    floors,
    roomTypes,
    rooms,
    roomAllocations,
    caterers,
    messes,
    messRegistrations,
    complaintTypes,
    complaints
  };
}

// Master Synchronization Function
async function syncDatabaseToGraph() {
  const startTime = Date.now();
  console.log('=======================================================');
  console.log('STARTING MYSQL -> NEO4J SYNCHRONIZATION PIPELINE');
  console.log('=======================================================');

  const health = await neo.checkHealth();
  if (!health.connected) {
    const errorMsg = `Neo4j is offline or unconfigured (${health.message || health.error}). Please verify backend/.env settings.`;
    console.error(`❌ ${errorMsg}`);
    throw new Error(errorMsg);
  }

  console.log(`Target Graph: ${health.uri} (Database: ${health.database})`);
  console.log(`Extracting authoritative data from MySQL / Data Engine...`);

  const data = await fetchSourceData();
  console.log(`Loaded records: ${data.students.length} students, ${data.rooms.length} rooms, ${data.complaints.length} complaints, ${data.messes.length} messes.`);

  const stats = {
    students: data.students.length,
    hostels: data.hostels.length,
    blocks: data.blocks.length,
    floors: data.floors.length,
    roomTypes: data.roomTypes.length,
    rooms: data.rooms.length,
    allocations: data.roomAllocations.length,
    caterers: data.caterers.length,
    messes: data.messes.length,
    messRegistrations: data.messRegistrations.length,
    complaintTypes: data.complaintTypes.length,
    complaints: data.complaints.length,
    facilityLinks: 0
  };

  // 1. Hostels
  if (data.hostels.length > 0) {
    await neo.writeQuery(`
      UNWIND $items AS h
      MERGE (hostel:Hostel {hostel_id: h.hostel_id})
      ON CREATE SET hostel.hostel_name = h.hostel_name,
                    hostel.hostel_type = h.hostel_type,
                    hostel.warden_name = h.warden_name,
                    hostel.warden_contact = h.warden_contact,
                    hostel.synced_at = datetime()
      ON MATCH SET  hostel.hostel_name = h.hostel_name,
                    hostel.hostel_type = h.hostel_type,
                    hostel.warden_name = h.warden_name,
                    hostel.warden_contact = h.warden_contact,
                    hostel.synced_at = datetime()
    `, { items: data.hostels });
  }

  // 2. Blocks and Block -> Hostel
  if (data.blocks.length > 0) {
    await neo.writeQuery(`
      UNWIND $items AS b
      MERGE (block:Block {block_id: b.block_id})
      ON CREATE SET block.block_name = b.block_name,
                    block.hostel_id = b.hostel_id
      ON MATCH SET  block.block_name = b.block_name,
                    block.hostel_id = b.hostel_id
      WITH block, b
      MATCH (h:Hostel {hostel_id: b.hostel_id})
      MERGE (block)-[:PART_OF]->(h)
    `, { items: data.blocks });
  }

  // 3. Floors and Floor -> Block
  if (data.floors.length > 0) {
    await neo.writeQuery(`
      UNWIND $items AS f
      MERGE (floor:Floor {floor_id: f.floor_id})
      ON CREATE SET floor.floor_number = f.floor_number,
                    floor.block_id = f.block_id
      ON MATCH SET  floor.floor_number = f.floor_number,
                    floor.block_id = f.block_id
      WITH floor, f
      MATCH (b:Block {block_id: f.block_id})
      MERGE (floor)-[:IN_BLOCK]->(b)
    `, { items: data.floors });
  }

  // 4. RoomTypes
  if (data.roomTypes.length > 0) {
    await neo.writeQuery(`
      UNWIND $items AS rt
      MERGE (type:RoomType {room_type_id: rt.room_type_id})
      ON CREATE SET type.capacity = rt.capacity,
                    type.ac_type = rt.ac_type,
                    type.fee_per_semester = rt.fee_per_semester
      ON MATCH SET  type.capacity = rt.capacity,
                    type.ac_type = rt.ac_type,
                    type.fee_per_semester = rt.fee_per_semester
    `, { items: data.roomTypes });
  }

  // 5. Rooms and Room -> Floor & Room -> RoomType
  if (data.rooms.length > 0) {
    await neo.writeQuery(`
      UNWIND $items AS r
      MERGE (room:Room {room_id: r.room_id})
      ON CREATE SET room.room_number = r.room_number,
                    room.current_occupancy = r.current_occupancy,
                    room.is_active = r.is_active,
                    room.floor_id = r.floor_id,
                    room.room_type_id = r.room_type_id
      ON MATCH SET  room.room_number = r.room_number,
                    room.current_occupancy = r.current_occupancy,
                    room.is_active = r.is_active,
                    room.floor_id = r.floor_id,
                    room.room_type_id = r.room_type_id
      WITH room, r
      MATCH (f:Floor {floor_id: r.floor_id})
      MERGE (room)-[:ON_FLOOR]->(f)
      WITH room, r
      MATCH (rt:RoomType {room_type_id: r.room_type_id})
      MERGE (room)-[:HAS_TYPE]->(rt)
    `, { items: data.rooms });
  }

  // 6. Students
  if (data.students.length > 0) {
    await neo.writeQuery(`
      UNWIND $items AS s
      MERGE (st:Student {student_id: s.student_id})
      ON CREATE SET st.reg_no = s.reg_no,
                    st.full_name = s.full_name,
                    st.branch = s.branch,
                    st.course = s.course,
                    st.year_of_study = s.year_of_study,
                    st.gender = s.gender,
                    st.email = s.email,
                    st.phone_number = s.phone_number
      ON MATCH SET  st.reg_no = s.reg_no,
                    st.full_name = s.full_name,
                    st.branch = s.branch,
                    st.course = s.course,
                    st.year_of_study = s.year_of_study,
                    st.gender = s.gender,
                    st.email = s.email,
                    st.phone_number = s.phone_number
    `, { items: data.students });
  }

  // 7. Room Allocations & Relationships
  if (data.roomAllocations.length > 0) {
    const { validAllocations } = validateRoomAllocationsIntegrity(data.roomAllocations, data.students, data.rooms);
    if (validAllocations.length > 0) {
      await neo.writeQuery(`
        UNWIND $items AS ra
        MATCH (st:Student {student_id: ra.student_id})
        MATCH (r:Room {room_id: ra.room_id})
        MERGE (st)-[a:ALLOCATED_TO {allocation_id: ra.allocation_id}]->(r)
        ON CREATE SET a.status = ra.status,
                      a.allocation_date = ra.allocation_date,
                      a.vacate_date = ra.vacate_date
        ON MATCH SET  a.status = ra.status,
                      a.allocation_date = ra.allocation_date,
                      a.vacate_date = ra.vacate_date
      `, { items: validAllocations });
    }
  }

  // 8. Caterers
  if (data.caterers.length > 0) {
    await neo.writeQuery(`
      UNWIND $items AS cat
      MERGE (c:Caterer {caterer_id: cat.caterer_id})
      ON CREATE SET c.caterer_name = cat.caterer_name,
                    c.contact_person = cat.contact_person,
                    c.contact_number = cat.contact_number,
                    c.contract_start_date = cat.contract_start_date,
                    c.contract_end_date = cat.contract_end_date
      ON MATCH SET  c.caterer_name = cat.caterer_name,
                    c.contact_person = cat.contact_person,
                    c.contact_number = cat.contact_number,
                    c.contract_start_date = cat.contract_start_date,
                    c.contract_end_date = cat.contract_end_date
    `, { items: data.caterers });
  }

  // 9. Messes & Mess -> Caterer & Mess -> Hostel (Decoupled to ensure 100% node creation)
  if (data.messes.length > 0) {
    // 9a. Create or update ALL Mess nodes first
    await neo.writeQuery(`
      UNWIND $items AS m
      MERGE (mess:Mess {mess_id: m.mess_id})
      ON CREATE SET mess.mess_name = m.mess_name,
                    mess.mess_category = m.mess_category,
                    mess.monthly_fee = m.monthly_fee,
                    mess.capacity = m.capacity,
                    mess.hostel_id = m.hostel_id,
                    mess.caterer_id = m.caterer_id,
                    mess.synced_at = datetime()
      ON MATCH SET  mess.mess_name = m.mess_name,
                    mess.mess_category = m.mess_category,
                    mess.monthly_fee = m.monthly_fee,
                    mess.capacity = m.capacity,
                    mess.hostel_id = m.hostel_id,
                    mess.caterer_id = m.caterer_id,
                    mess.synced_at = datetime()
    `, { items: data.messes });

    // 9b. Connect Mess -> Caterer where caterer exists
    const messesWithCaterer = data.messes.filter(m => m.caterer_id);
    if (messesWithCaterer.length > 0) {
      await neo.writeQuery(`
        UNWIND $items AS m
        MATCH (mess:Mess {mess_id: m.mess_id})
        MATCH (cat:Caterer {caterer_id: m.caterer_id})
        MERGE (mess)-[:SERVED_BY]->(cat)
      `, { items: messesWithCaterer });
    }

    // 9c. Connect Mess -> Hostel where hostel exists
    const messesWithHostel = data.messes.filter(m => m.hostel_id);
    if (messesWithHostel.length > 0) {
      await neo.writeQuery(`
        UNWIND $items AS m
        MATCH (mess:Mess {mess_id: m.mess_id})
        MATCH (h:Hostel {hostel_id: m.hostel_id})
        MERGE (mess)-[:LOCATED_AT]->(h)
      `, { items: messesWithHostel });
    }
  }

  // 10. Mess Registrations with Pre-Flight Foreign-Key Integrity Verification
  if (data.messRegistrations.length > 0) {
    const { validRegistrations } = validateMessRegistrationsIntegrity(
      data.messRegistrations,
      data.students,
      data.messes
    );

    if (validRegistrations.length > 0) {
      await neo.writeQuery(`
        UNWIND $items AS mr
        MATCH (st:Student {student_id: mr.student_id})
        MATCH (m:Mess {mess_id: mr.mess_id})
        MERGE (st)-[r:REGISTERED_FOR {mess_reg_id: mr.mess_reg_id}]->(m)
        ON CREATE SET r.status = mr.status,
                      r.registration_date = mr.registration_date,
                      r.end_date = mr.end_date
        ON MATCH SET  r.status = mr.status,
                      r.registration_date = mr.registration_date,
                      r.end_date = mr.end_date
      `, { items: validRegistrations });
    }
  }

  // 11. Complaint Types
  if (data.complaintTypes.length > 0) {
    await neo.writeQuery(`
      UNWIND $items AS ct
      MERGE (type:ComplaintType {complaint_type_id: ct.complaint_type_id})
      ON CREATE SET type.type_name = ct.type_name,
                    type.category = ct.category
      ON MATCH SET  type.type_name = ct.type_name,
                    type.category = ct.category
    `, { items: data.complaintTypes });
  }

  // 12. Complaints & Complaint Relationships
  if (data.complaints.length > 0) {
    await neo.writeQuery(`
      UNWIND $items AS c
      MERGE (comp:Complaint {complaint_id: c.complaint_id})
      ON CREATE SET comp.description = c.description,
                    comp.status = c.status,
                    comp.complaint_date = c.complaint_date,
                    comp.resolved_date = c.resolved_date,
                    comp.remarks = c.remarks,
                    comp.student_id = c.student_id,
                    comp.complaint_type_id = c.complaint_type_id,
                    comp.room_id = c.room_id,
                    comp.mess_id = c.mess_id,
                    comp.hostel_id = c.hostel_id
      ON MATCH SET  comp.description = c.description,
                    comp.status = c.status,
                    comp.complaint_date = c.complaint_date,
                    comp.resolved_date = c.resolved_date,
                    comp.remarks = c.remarks,
                    comp.student_id = c.student_id,
                    comp.complaint_type_id = c.complaint_type_id,
                    comp.room_id = c.room_id,
                    comp.mess_id = c.mess_id,
                    comp.hostel_id = c.hostel_id
      WITH comp, c
      MATCH (st:Student {student_id: c.student_id})
      MERGE (st)-[:FILED]->(comp)
      WITH comp, c
      MATCH (ct:ComplaintType {complaint_type_id: c.complaint_type_id})
      MERGE (comp)-[:OF_TYPE]->(ct)
    `, { items: data.complaints });

    // Explicit facility links: Reset existing ASSOCIATED_WITH to prevent obsolete edges upon update
    await neo.writeQuery(`
      UNWIND $items AS c
      MATCH (comp:Complaint {complaint_id: c.complaint_id})-[r:ASSOCIATED_WITH]->()
      DELETE r
    `, { items: data.complaints });

    // Link Room if explicitly provided
    const roomComplaints = data.complaints.filter(c => c.room_id != null);
    if (roomComplaints.length > 0) {
      await neo.writeQuery(`
        UNWIND $items AS c
        MATCH (comp:Complaint {complaint_id: c.complaint_id})
        MATCH (r:Room {room_id: c.room_id})
        MERGE (comp)-[:ASSOCIATED_WITH]->(r)
      `, { items: roomComplaints });
      stats.facilityLinks += roomComplaints.length;
    }

    // Link Mess if explicitly provided
    const messComplaints = data.complaints.filter(c => c.mess_id != null);
    if (messComplaints.length > 0) {
      await neo.writeQuery(`
        UNWIND $items AS c
        MATCH (comp:Complaint {complaint_id: c.complaint_id})
        MATCH (m:Mess {mess_id: c.mess_id})
        MERGE (comp)-[:ASSOCIATED_WITH]->(m)
      `, { items: messComplaints });
      stats.facilityLinks += messComplaints.length;
    }

    // Link Hostel if explicitly provided
    const hostelComplaints = data.complaints.filter(c => c.hostel_id != null);
    if (hostelComplaints.length > 0) {
      await neo.writeQuery(`
        UNWIND $items AS c
        MATCH (comp:Complaint {complaint_id: c.complaint_id})
        MATCH (h:Hostel {hostel_id: c.hostel_id})
        MERGE (comp)-[:ASSOCIATED_WITH]->(h)
      `, { items: hostelComplaints });
      stats.facilityLinks += hostelComplaints.length;
    }
  }

  const durationMs = Date.now() - startTime;
  console.log('=======================================================');
  console.log(`✅ SYNCHRONIZATION SUCCESSFUL (Completed in ${durationMs}ms)`);
  console.log(`- Nodes Processed: ${stats.students + stats.hostels + stats.blocks + stats.floors + stats.rooms + stats.complaints + stats.messes + stats.caterers}`);
  console.log(`- Active Facility Grievance Links Established: ${stats.facilityLinks}`);
  console.log('=======================================================');

  return {
    success: true,
    durationMs,
    timestamp: new Date().toISOString(),
    stats
  };
}

// Allow CLI execution
if (require.main === module) {
  syncDatabaseToGraph()
    .then(async () => {
      await neo.closeDriver();
      process.exit(0);
    })
    .catch(async err => {
      console.error('Fatal sync pipeline failure:', err.message);
      await neo.closeDriver();
      process.exit(1);
    });
}

module.exports = {
  syncDatabaseToGraph,
  fetchSourceData
};

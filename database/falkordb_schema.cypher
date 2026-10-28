// ==============================================================================
// FALKORDB GRAPH DATA MODEL SPECIFICATION
// Purpose: Defines node labels, entity uniqueness constraints, and search indexes for FalkorDB.
// Node Labels (10):
//   (:Student)        - student_id, reg_no, full_name, branch, course, year_of_study, gender, email, phone_number
//   (:Room)           - room_id, room_number, current_occupancy, is_active, floor_id, room_type_id
//   (:Hostel)         - hostel_id, hostel_name, hostel_type, warden_name, warden_contact
//   (:Block)          - block_id, block_name, hostel_id
//   (:Floor)          - floor_id, floor_number, block_id
//   (:RoomType)       - room_type_id, capacity, ac_type, fee_per_semester
//   (:Mess)           - mess_id, mess_name, mess_category, monthly_fee, capacity, hostel_id, caterer_id
//   (:Caterer)        - caterer_id, caterer_name, contact_person, contact_number, contract_start_date, contract_end_date
//   (:Complaint)      - complaint_id, description, status, complaint_date, resolved_date, remarks, student_id, complaint_type_id, room_id, mess_id, hostel_id
//   (:ComplaintType)  - complaint_type_id, type_name, category
// Relationship Types (11):
//   (:Student)-[:ALLOCATED_TO {allocation_id, status, allocation_date, vacate_date}]->(:Room)
//   (:Room)-[:ON_FLOOR]->(:Floor)
//   (:Floor)-[:IN_BLOCK]->(:Block)
//   (:Block)-[:PART_OF]->(:Hostel)
//   (:Room)-[:HAS_TYPE]->(:RoomType)
//   (:Student)-[:REGISTERED_FOR {mess_reg_id, status, registration_date, end_date}]->(:Mess)
//   (:Mess)-[:SERVED_BY]->(:Caterer)
//   (:Mess)-[:LOCATED_AT]->(:Hostel)
//   (:Student)-[:FILED]->(:Complaint)
//   (:Complaint)-[:OF_TYPE]->(:ComplaintType)
//   (:Complaint)-[:ASSOCIATED_WITH]->(:Room | :Mess | :Hostel)
// ==============================================================================

// ------------------------------------------------------------------------------
// PRIMARY KEY RANGE INDEXES
// FalkorDB creates range indexes to accelerate primary key lookups during MERGE / MATCH.
// ------------------------------------------------------------------------------

CREATE INDEX FOR (s:Student) ON (s.student_id);
CREATE INDEX FOR (r:Room) ON (r.room_id);
CREATE INDEX FOR (h:Hostel) ON (h.hostel_id);
CREATE INDEX FOR (b:Block) ON (b.block_id);
CREATE INDEX FOR (f:Floor) ON (f.floor_id);
CREATE INDEX FOR (rt:RoomType) ON (rt.room_type_id);
CREATE INDEX FOR (c:Complaint) ON (c.complaint_id);
CREATE INDEX FOR (ct:ComplaintType) ON (ct.complaint_type_id);
CREATE INDEX FOR (m:Mess) ON (m.mess_id);
CREATE INDEX FOR (cat:Caterer) ON (cat.caterer_id);

// ------------------------------------------------------------------------------
// SECONDARY SEARCH & LOOKUP INDEXES
// Accelerates UI filtering and query predicates on high-frequency search fields.
// ------------------------------------------------------------------------------

CREATE INDEX FOR (s:Student) ON (s.reg_no);
CREATE INDEX FOR (r:Room) ON (r.room_number);
CREATE INDEX FOR (c:Complaint) ON (c.status);
CREATE INDEX FOR (m:Mess) ON (m.mess_name);
CREATE INDEX FOR (h:Hostel) ON (h.hostel_name);


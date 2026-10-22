// ==============================================================================
// NEO4J GRAPH DATA MODEL & CONSTRAINTS (DA2 HOSTEL & MESS MANAGEMENT)
// Compatible with Neo4j 5.x / 6.x and Neo4j AuraDB
// ==============================================================================

// ------------------------------------------------------------------------------
// 1. UNIQUENESS CONSTRAINTS (Stable MySQL Primary Keys)
// ------------------------------------------------------------------------------

CREATE CONSTRAINT student_id_unique IF NOT EXISTS
FOR (s:Student) REQUIRE s.student_id IS UNIQUE;

CREATE CONSTRAINT room_id_unique IF NOT EXISTS
FOR (r:Room) REQUIRE r.room_id IS UNIQUE;

CREATE CONSTRAINT hostel_id_unique IF NOT EXISTS
FOR (h:Hostel) REQUIRE h.hostel_id IS UNIQUE;

CREATE CONSTRAINT block_id_unique IF NOT EXISTS
FOR (b:Block) REQUIRE b.block_id IS UNIQUE;

CREATE CONSTRAINT floor_id_unique IF NOT EXISTS
FOR (f:Floor) REQUIRE f.floor_id IS UNIQUE;

CREATE CONSTRAINT room_type_id_unique IF NOT EXISTS
FOR (rt:RoomType) REQUIRE rt.room_type_id IS UNIQUE;

CREATE CONSTRAINT complaint_id_unique IF NOT EXISTS
FOR (c:Complaint) REQUIRE c.complaint_id IS UNIQUE;

CREATE CONSTRAINT complaint_type_id_unique IF NOT EXISTS
FOR (ct:ComplaintType) REQUIRE ct.complaint_type_id IS UNIQUE;

CREATE CONSTRAINT mess_id_unique IF NOT EXISTS
FOR (m:Mess) REQUIRE m.mess_id IS UNIQUE;

CREATE CONSTRAINT caterer_id_unique IF NOT EXISTS
FOR (cat:Caterer) REQUIRE cat.caterer_id IS UNIQUE;

// ------------------------------------------------------------------------------
// 2. SEARCH & LOOKUP INDEXES
// ------------------------------------------------------------------------------

CREATE INDEX student_reg_no_idx IF NOT EXISTS
FOR (s:Student) ON (s.reg_no);

CREATE INDEX room_number_idx IF NOT EXISTS
FOR (r:Room) ON (r.room_number);

CREATE INDEX complaint_status_idx IF NOT EXISTS
FOR (c:Complaint) ON (c.status);

CREATE INDEX mess_name_idx IF NOT EXISTS
FOR (m:Mess) ON (m.mess_name);

CREATE INDEX hostel_name_idx IF NOT EXISTS
FOR (h:Hostel) ON (h.hostel_name);

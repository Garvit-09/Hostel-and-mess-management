-- ==============================================================================
-- VIVA_GRIEVANCE_HOTSPOT: RELATIONAL SCHEMA EXTENSION FOR FACILITY GRIEVANCE LINKING
-- VIVA_NEO4J_SCHEMA: COMPLAINT-TO-FACILITY ASSOCIATIONS
-- VIVA_NEO4J_DATA_VALIDATION: NULLABLE FOREIGN KEYS WITH ON DELETE SET NULL
-- VIVA_NEO4J_LIMITATIONS: SPATIAL ASSOCIATION VS CAUSATION
-- Purpose: Adds optional, backward-compatible facility links to the MySQL Complaint table so grievances can be associated with Room, Mess, or Hostel entities in Neo4j.
-- Entry point: database/migration_neo4j_facility_complaint.sql
-- Input: Existing Complaint, Room, Mess, and Hostel tables.
-- Logic:
--   1. Adds 3 nullable columns (room_id, mess_id, hostel_id).
--   2. Adds foreign key constraints with ON DELETE SET NULL to prevent loss of grievance records when a room or mess is decommissioned.
--   3. Adds composite indexes on (room_id, status), (mess_id, status), and (hostel_id, status) for accelerated hotspot aggregation.
--   4. Updates sample records to map specific grievances to facilities.
-- Neo4j role: The ETL synchronization reads these columns to construct (:Complaint)-[:ASSOCIATED_WITH]->(:Room|:Mess|:Hostel) edges.
-- MySQL role: Authoritative transactional storage of complaint records with relational integrity.
-- Unlinked complaints: Complaints with NULL facility foreign keys represent general/campus-wide grievances and are preserved without forced links.
-- Viva explanation: "In traditional hostel management, complaints only reference a student and a complaint type. This migration adds optional foreign keys for room_id, mess_id, and hostel_id with ON DELETE SET NULL. When synced to Neo4j, these keys generate ASSOCIATED_WITH relationships. A high complaint count flags facilities requiring inspection, but does not inherently prove equipment failure or staff negligence—it provides an operational hotspot indicator."
-- Demonstration search: VIVA_GRIEVANCE_HOTSPOT
-- ==============================================================================

USE hostel_mess_management;

-- 1. Add nullable foreign key columns for Room, Mess, and Hostel facilities
ALTER TABLE Complaint
    ADD COLUMN room_id INT NULL AFTER remarks,
    ADD COLUMN mess_id INT NULL AFTER room_id,
    ADD COLUMN hostel_id INT NULL AFTER mess_id;

-- 2. Add foreign key constraints with ON DELETE SET NULL to preserve complaint history
ALTER TABLE Complaint
    ADD CONSTRAINT fk_complaint_room FOREIGN KEY (room_id)
        REFERENCES Room(room_id) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT fk_complaint_mess FOREIGN KEY (mess_id)
        REFERENCES Mess(mess_id) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT fk_complaint_hostel FOREIGN KEY (hostel_id)
        REFERENCES Hostel(hostel_id) ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Add composite indexes for accelerated hotspot analytical queries
CREATE INDEX idx_complaint_facility_room ON Complaint (room_id, status);
CREATE INDEX idx_complaint_facility_mess ON Complaint (mess_id, status);
CREATE INDEX idx_complaint_facility_hostel ON Complaint (hostel_id, status);

-- 4. Map known sample complaints to explicit facilities (idempotent updates)
-- Complaint 1: AC thermostat in room G01 -> Room 1 (G01)
UPDATE Complaint SET room_id = 1 WHERE complaint_id = 1;

-- Complaint 2: Bathroom faucet leaking near G01 -> Hostel 1 (Hostel Block A)
UPDATE Complaint SET hostel_id = 1 WHERE complaint_id = 2;

-- Complaint 4: Rice undercooked dinner -> Mess 2 (Block A Dining - Non-Veg)
UPDATE Complaint SET mess_id = 2 WHERE complaint_id = 4;

-- Complaint 6: Cupboard latch broken in room 102 -> Room 4 (102)
UPDATE Complaint SET room_id = 4 WHERE complaint_id = 6;

-- Complaint 7: Dining tables not cleaned -> Mess 3 (Block B Dining - Multi-Cuisine)
UPDATE Complaint SET mess_id = 3 WHERE complaint_id = 7;

-- Note: Complaints 3 and 5 remain unlinked (room_id, mess_id, hostel_id IS NULL)
-- to demonstrate verified separation of general vs facility-specific grievances.


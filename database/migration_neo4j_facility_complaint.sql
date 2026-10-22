-- ==============================================================================
-- DATABASE MIGRATION: Facility Association for Complaints (DA2 Neo4j Integration)
-- Purpose: Adds optional, backward-compatible facility links to Complaint table
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

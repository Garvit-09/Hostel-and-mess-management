-- ==============================================================================
-- HOSTEL & MESS MANAGEMENT SYSTEM (DA2 DATABASE IMPLEMENTATION)
-- Student: Garvit Kaushik (Reg No: 25BCE5689)
-- Database Engine: MySQL 8.0+ / MariaDB / Oracle PL/SQL Compatible Routines
-- ==============================================================================

DROP DATABASE IF EXISTS hostel_mess_management;
CREATE DATABASE hostel_mess_management;
USE hostel_mess_management;

SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';

-- ------------------------------------------------------------------------------
-- 1. TABLE DEFINITIONS
-- ------------------------------------------------------------------------------

-- Student Table
CREATE TABLE Student (
    student_id INT AUTO_INCREMENT PRIMARY KEY,
    reg_no VARCHAR(20) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    course VARCHAR(50) NOT NULL,
    branch VARCHAR(50) NOT NULL,
    year_of_study TINYINT NOT NULL,
    gender ENUM('Male','Female','Other') NOT NULL,
    phone_number VARCHAR(15) NOT NULL,
    email VARCHAR(100) NOT NULL,
    parent_name VARCHAR(100) NOT NULL,
    parent_contact VARCHAR(15) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_student_regno (reg_no),
    UNIQUE KEY uq_student_phone (phone_number),
    UNIQUE KEY uq_student_email (email),
    CONSTRAINT chk_student_year CHECK (year_of_study BETWEEN 1 AND 5)
) ENGINE=InnoDB;

-- Hostel Table
CREATE TABLE Hostel (
    hostel_id INT AUTO_INCREMENT PRIMARY KEY,
    hostel_name VARCHAR(100) NOT NULL,
    hostel_type ENUM('Boys','Girls') NOT NULL,
    warden_name VARCHAR(100) NULL,
    warden_contact VARCHAR(15) NULL,
    UNIQUE KEY uq_hostel_name (hostel_name)
) ENGINE=InnoDB;

-- Block Table
CREATE TABLE Block (
    block_id INT AUTO_INCREMENT PRIMARY KEY,
    hostel_id INT NOT NULL,
    block_name VARCHAR(20) NOT NULL,
    CONSTRAINT fk_block_hostel FOREIGN KEY (hostel_id)
        REFERENCES Hostel(hostel_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    UNIQUE KEY uq_block_per_hostel (hostel_id, block_name)
) ENGINE=InnoDB;

-- Floor Table
CREATE TABLE Floor (
    floor_id INT AUTO_INCREMENT PRIMARY KEY,
    block_id INT NOT NULL,
    floor_number TINYINT NOT NULL,
    CONSTRAINT fk_floor_block FOREIGN KEY (block_id)
        REFERENCES Block(block_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    UNIQUE KEY uq_floor_per_block (block_id, floor_number),
    CONSTRAINT chk_floor_number CHECK (floor_number >= 0)
) ENGINE=InnoDB;

-- RoomType Table
CREATE TABLE RoomType (
    room_type_id INT AUTO_INCREMENT PRIMARY KEY,
    capacity TINYINT NOT NULL,
    ac_type ENUM('AC','Non-AC') NOT NULL,
    fee_per_semester DECIMAL(10,2) NOT NULL,
    UNIQUE KEY uq_roomtype_combo (capacity, ac_type),
    CONSTRAINT chk_roomtype_capacity CHECK (capacity IN (1,2,3,4,6)),
    CONSTRAINT chk_roomtype_fee CHECK (fee_per_semester >= 0)
) ENGINE=InnoDB;

-- Room Table
CREATE TABLE Room (
    room_id INT AUTO_INCREMENT PRIMARY KEY,
    floor_id INT NOT NULL,
    room_type_id INT NOT NULL,
    room_number VARCHAR(10) NOT NULL,
    current_occupancy TINYINT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_room_floor FOREIGN KEY (floor_id)
        REFERENCES Floor(floor_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_room_roomtype FOREIGN KEY (room_type_id)
        REFERENCES RoomType(room_type_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    UNIQUE KEY uq_room_per_floor (floor_id, room_number),
    CONSTRAINT chk_room_occupancy CHECK (current_occupancy >= 0)
) ENGINE=InnoDB;

-- RoomAllocation Table
CREATE TABLE RoomAllocation (
    allocation_id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    room_id INT NOT NULL,
    allocation_date DATE NOT NULL DEFAULT (CURRENT_DATE),
    vacate_date DATE NULL,
    status ENUM('Active','Vacated') NOT NULL DEFAULT 'Active',
    CONSTRAINT fk_alloc_student FOREIGN KEY (student_id)
        REFERENCES Student(student_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_alloc_room FOREIGN KEY (room_id)
        REFERENCES Room(room_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_alloc_dates CHECK (vacate_date IS NULL OR vacate_date >= allocation_date),
    INDEX idx_alloc_student_status (student_id, status),
    INDEX idx_alloc_room_status (room_id, status)
) ENGINE=InnoDB;

-- ComplaintType Table
CREATE TABLE ComplaintType (
    complaint_type_id INT AUTO_INCREMENT PRIMARY KEY,
    type_name VARCHAR(50) NOT NULL,
    category ENUM('Hostel','Mess') NOT NULL,
    UNIQUE KEY uq_complainttype_name (type_name)
) ENGINE=InnoDB;

-- Complaint Table
CREATE TABLE Complaint (
    complaint_id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    complaint_type_id INT NOT NULL,
    complaint_date DATE NOT NULL DEFAULT (CURRENT_DATE),
    description VARCHAR(500) NOT NULL,
    status ENUM('Pending','In Progress','Resolved') NOT NULL DEFAULT 'Pending',
    resolved_date DATE NULL,
    remarks VARCHAR(255) NULL,
    CONSTRAINT fk_complaint_student FOREIGN KEY (student_id)
        REFERENCES Student(student_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_complaint_type FOREIGN KEY (complaint_type_id)
        REFERENCES ComplaintType(complaint_type_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_complaint_dates CHECK (resolved_date IS NULL OR resolved_date >= complaint_date),
    INDEX idx_complaint_status (status)
) ENGINE=InnoDB;

-- Caterer Table
CREATE TABLE Caterer (
    caterer_id INT AUTO_INCREMENT PRIMARY KEY,
    caterer_name VARCHAR(100) NOT NULL,
    contact_person VARCHAR(100) NULL,
    contact_number VARCHAR(15) NOT NULL,
    contract_start_date DATE NOT NULL,
    contract_end_date DATE NULL,
    CONSTRAINT chk_caterer_contract CHECK (contract_end_date IS NULL OR contract_end_date >= contract_start_date)
) ENGINE=InnoDB;

-- Mess Table
CREATE TABLE Mess (
    mess_id INT AUTO_INCREMENT PRIMARY KEY,
    hostel_id INT NOT NULL,
    caterer_id INT NOT NULL,
    mess_name VARCHAR(100) NOT NULL,
    mess_category ENUM('Veg','Non-Veg','Special') NOT NULL,
    monthly_fee DECIMAL(8,2) NOT NULL,
    capacity INT NOT NULL,
    CONSTRAINT fk_mess_hostel FOREIGN KEY (hostel_id)
        REFERENCES Hostel(hostel_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_mess_caterer FOREIGN KEY (caterer_id)
        REFERENCES Caterer(caterer_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    UNIQUE KEY uq_mess_name_per_hostel (hostel_id, mess_name),
    CONSTRAINT chk_mess_capacity CHECK (capacity > 0),
    CONSTRAINT chk_mess_fee CHECK (monthly_fee >= 0)
) ENGINE=InnoDB;

-- MessRegistration Table
CREATE TABLE MessRegistration (
    mess_reg_id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    mess_id INT NOT NULL,
    registration_date DATE NOT NULL DEFAULT (CURRENT_DATE),
    end_date DATE NULL,
    status ENUM('Active','Ended') NOT NULL DEFAULT 'Active',
    CONSTRAINT fk_messreg_student FOREIGN KEY (student_id)
        REFERENCES Student(student_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_messreg_mess FOREIGN KEY (mess_id)
        REFERENCES Mess(mess_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_messreg_dates CHECK (end_date IS NULL OR end_date >= registration_date),
    INDEX idx_messreg_student_status (student_id, status)
) ENGINE=InnoDB;

-- MessMenu Table
CREATE TABLE MessMenu (
    menu_id INT AUTO_INCREMENT PRIMARY KEY,
    mess_id INT NOT NULL,
    week_start_date DATE NOT NULL,
    day_of_week ENUM('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday') NOT NULL,
    meal_type ENUM('Breakfast','Lunch','Snacks','Dinner') NOT NULL,
    CONSTRAINT fk_menu_mess FOREIGN KEY (mess_id)
        REFERENCES Mess(mess_id) ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE KEY uq_menu_slot (mess_id, week_start_date, day_of_week, meal_type)
) ENGINE=InnoDB;

-- MenuItem Table
CREATE TABLE MenuItem (
    menu_item_id INT AUTO_INCREMENT PRIMARY KEY,
    menu_id INT NOT NULL,
    item_name VARCHAR(100) NOT NULL,
    CONSTRAINT fk_menuitem_menu FOREIGN KEY (menu_id)
        REFERENCES MessMenu(menu_id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- MealAttendance Table
CREATE TABLE MealAttendance (
    attendance_id INT AUTO_INCREMENT PRIMARY KEY,
    mess_reg_id INT NOT NULL,
    attendance_date DATE NOT NULL DEFAULT (CURRENT_DATE),
    meal_type ENUM('Breakfast','Lunch','Snacks','Dinner') NOT NULL,
    CONSTRAINT fk_attendance_messreg FOREIGN KEY (mess_reg_id)
        REFERENCES MessRegistration(mess_reg_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    UNIQUE KEY uq_attendance_slot (mess_reg_id, attendance_date, meal_type)
) ENGINE=InnoDB;

-- MessFeePayment Table
CREATE TABLE MessFeePayment (
    mess_payment_id INT AUTO_INCREMENT PRIMARY KEY,
    mess_reg_id INT NOT NULL,
    payment_date DATE NOT NULL DEFAULT (CURRENT_DATE),
    amount_paid DECIMAL(8,2) NOT NULL,
    payment_month CHAR(7) NOT NULL COMMENT 'Format: YYYY-MM',
    payment_mode ENUM('Cash','Online','Card') NOT NULL DEFAULT 'Online',
    CONSTRAINT fk_messpay_messreg FOREIGN KEY (mess_reg_id)
        REFERENCES MessRegistration(mess_reg_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    UNIQUE KEY uq_messpay_month (mess_reg_id, payment_month),
    CONSTRAINT chk_messpay_amount CHECK (amount_paid >= 0)
) ENGINE=InnoDB;

-- MessFeedback Table
CREATE TABLE MessFeedback (
    feedback_id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    mess_id INT NOT NULL,
    feedback_date DATE NOT NULL DEFAULT (CURRENT_DATE),
    rating TINYINT NOT NULL,
    comments VARCHAR(500) NULL,
    CONSTRAINT fk_feedback_student FOREIGN KEY (student_id)
        REFERENCES Student(student_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_feedback_mess FOREIGN KEY (mess_id)
        REFERENCES Mess(mess_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_feedback_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB;

-- ------------------------------------------------------------------------------
-- 2. TRIGGERS (AUTOMATION & INTEGRITY ENFORCEMENT)
-- ------------------------------------------------------------------------------

DELIMITER $$

-- Trigger: Automatically increment room occupancy upon active allocation
CREATE TRIGGER trg_alloc_after_insert AFTER INSERT ON RoomAllocation
FOR EACH ROW BEGIN
    IF NEW.status = 'Active' THEN
        UPDATE Room SET current_occupancy = current_occupancy + 1 WHERE room_id = NEW.room_id;
    END IF;
END$$

-- Trigger: Automatically update room occupancy when allocation status changes
CREATE TRIGGER trg_alloc_after_update AFTER UPDATE ON RoomAllocation
FOR EACH ROW BEGIN
    IF OLD.status = 'Active' AND NEW.status = 'Vacated' THEN
        UPDATE Room SET current_occupancy = current_occupancy - 1 WHERE room_id = OLD.room_id;
    ELSEIF OLD.status = 'Vacated' AND NEW.status = 'Active' THEN
        UPDATE Room SET current_occupancy = current_occupancy + 1 WHERE room_id = NEW.room_id;
    END IF;
    IF NEW.status = 'Active' AND OLD.status = 'Active' AND NEW.room_id <> OLD.room_id THEN
        UPDATE Room SET current_occupancy = current_occupancy - 1 WHERE room_id = OLD.room_id;
        UPDATE Room SET current_occupancy = current_occupancy + 1 WHERE room_id = NEW.room_id;
    END IF;
END$$

-- Trigger: Prevent multiple active room allocations for the same student
CREATE TRIGGER trg_alloc_before_insert_single_active BEFORE INSERT ON RoomAllocation
FOR EACH ROW BEGIN
    DECLARE active_count INT;
    IF NEW.status = 'Active' THEN
        SELECT COUNT(*) INTO active_count FROM RoomAllocation
        WHERE student_id = NEW.student_id AND status = 'Active';
        IF active_count > 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Integrity Violation: Student already has an active room allocation.';
        END IF;
    END IF;
END$$

-- Trigger: Ensure updates do not violate single active room allocation
CREATE TRIGGER trg_alloc_before_update_single_active BEFORE UPDATE ON RoomAllocation
FOR EACH ROW BEGIN
    DECLARE active_count INT;
    IF NEW.status = 'Active' AND OLD.status <> 'Active' THEN
        SELECT COUNT(*) INTO active_count FROM RoomAllocation
        WHERE student_id = NEW.student_id AND status = 'Active' AND allocation_id <> NEW.allocation_id;
        IF active_count > 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Integrity Violation: Student already has an active room allocation.';
        END IF;
    END IF;
END$$

-- Trigger: Prevent duplicate active mess registrations
CREATE TRIGGER trg_messreg_before_insert_single_active BEFORE INSERT ON MessRegistration
FOR EACH ROW BEGIN
    DECLARE active_count INT;
    IF NEW.status = 'Active' THEN
        SELECT COUNT(*) INTO active_count FROM MessRegistration
        WHERE student_id = NEW.student_id AND status = 'Active';
        IF active_count > 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Integrity Violation: Student already has an active mess registration.';
        END IF;
    END IF;
END$$

-- Trigger: Ensure updates preserve single active mess registration
CREATE TRIGGER trg_messreg_before_update_single_active BEFORE UPDATE ON MessRegistration
FOR EACH ROW BEGIN
    DECLARE active_count INT;
    IF NEW.status = 'Active' AND OLD.status <> 'Active' THEN
        SELECT COUNT(*) INTO active_count FROM MessRegistration
        WHERE student_id = NEW.student_id AND status = 'Active' AND mess_reg_id <> NEW.mess_reg_id;
        IF active_count > 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Integrity Violation: Student already has an active mess registration.';
        END IF;
    END IF;
END$$

DELIMITER ;

-- ------------------------------------------------------------------------------
-- 3. VIEWS FOR REPORTING & ANALYTICS
-- ------------------------------------------------------------------------------

-- View 1: Hostel Occupancy Analytics
CREATE OR REPLACE VIEW HostelOccupancy AS
SELECT h.hostel_id, h.hostel_name, h.hostel_type,
       COUNT(DISTINCT bl.block_id) AS total_blocks,
       COUNT(DISTINCT fl.floor_id) AS total_floors,
       COUNT(DISTINCT r.room_id) AS total_rooms,
       COALESCE(SUM(rt.capacity),0) AS total_bed_capacity,
       COALESCE(SUM(r.current_occupancy),0) AS current_occupancy,
       ROUND(100 * COALESCE(SUM(r.current_occupancy),0) / NULLIF(SUM(rt.capacity),0),2) AS occupancy_percentage
FROM Hostel h
LEFT JOIN Block bl ON bl.hostel_id = h.hostel_id
LEFT JOIN Floor fl ON fl.block_id = bl.block_id
LEFT JOIN Room r ON r.floor_id = fl.floor_id
LEFT JOIN RoomType rt ON rt.room_type_id = r.room_type_id
GROUP BY h.hostel_id, h.hostel_name, h.hostel_type;

-- View 2: Detailed Student Room Allocations
CREATE OR REPLACE VIEW StudentRoomDetails AS
SELECT s.student_id, s.reg_no, s.full_name,
       h.hostel_name, bl.block_name, fl.floor_number, r.room_number,
       rt.capacity, rt.ac_type, ra.allocation_date, ra.status AS allocation_status
FROM Student s
JOIN RoomAllocation ra ON ra.student_id = s.student_id AND ra.status = 'Active'
JOIN Room r ON r.room_id = ra.room_id
JOIN Floor fl ON fl.floor_id = r.floor_id
JOIN Block bl ON bl.block_id = fl.block_id
JOIN Hostel h ON h.hostel_id = bl.hostel_id
JOIN RoomType rt ON rt.room_type_id = r.room_type_id;

-- View 3: Active Student Mess Subscriptions
CREATE OR REPLACE VIEW StudentMessDetails AS
SELECT s.student_id, s.reg_no, s.full_name,
       m.mess_name, m.mess_category, c.caterer_name, mr.registration_date, mr.status AS registration_status
FROM Student s
JOIN MessRegistration mr ON mr.student_id = s.student_id AND mr.status = 'Active'
JOIN Mess m ON m.mess_id = mr.mess_id
JOIN Caterer c ON c.caterer_id = m.caterer_id;

-- View 4: Pending / Open Complaints
CREATE OR REPLACE VIEW PendingComplaints AS
SELECT co.complaint_id, s.reg_no, s.full_name, ct.type_name, ct.category,
       co.complaint_date, co.description, co.status,
       DATEDIFF(CURDATE(), co.complaint_date) AS days_open
FROM Complaint co
JOIN Student s ON s.student_id = co.student_id
JOIN ComplaintType ct ON ct.complaint_type_id = co.complaint_type_id
WHERE co.status <> 'Resolved';

-- View 5: Revenue Summary per Mess
CREATE OR REPLACE VIEW MessRevenueSummary AS
SELECT m.mess_id, m.mess_name, m.mess_category,
       COALESCE(fee.total_fee_collected,0) AS total_fee_collected,
       COALESCE(fee.total_transactions,0) AS total_transactions
FROM Mess m
LEFT JOIN (
    SELECT mr.mess_id, 
           SUM(mfp.amount_paid) AS total_fee_collected,
           COUNT(mfp.mess_payment_id) AS total_transactions
    FROM MessFeePayment mfp
    JOIN MessRegistration mr ON mr.mess_reg_id = mfp.mess_reg_id
    GROUP BY mr.mess_id
) fee ON fee.mess_id = m.mess_id;

-- ------------------------------------------------------------------------------
-- 4. PL/SQL STORED FUNCTIONS
-- ------------------------------------------------------------------------------

DELIMITER $$

-- Function 1: Available Beds in a Room
CREATE FUNCTION AvailableBeds(p_room_id INT) RETURNS INT NOT DETERMINISTIC READS SQL DATA
BEGIN
    DECLARE v_capacity INT;
    DECLARE v_occupancy INT;
    SELECT rt.capacity, r.current_occupancy INTO v_capacity, v_occupancy
    FROM Room r JOIN RoomType rt ON rt.room_type_id = r.room_type_id
    WHERE r.room_id = p_room_id;
    IF v_capacity IS NULL THEN RETURN NULL; END IF;
    RETURN v_capacity - v_occupancy;
END$$

-- Function 2: Occupancy Percentage of a Hostel
CREATE FUNCTION HostelOccupancyPercentage(p_hostel_id INT) RETURNS DECIMAL(5,2) NOT DETERMINISTIC READS SQL DATA
BEGIN
    DECLARE v_capacity INT; DECLARE v_occupied INT;
    SELECT COALESCE(SUM(rt.capacity),0), COALESCE(SUM(r.current_occupancy),0) INTO v_capacity, v_occupied
    FROM Room r
    JOIN Floor fl ON fl.floor_id = r.floor_id
    JOIN Block bl ON bl.block_id = fl.block_id
    JOIN RoomType rt ON rt.room_type_id = r.room_type_id
    WHERE bl.hostel_id = p_hostel_id;
    IF v_capacity = 0 THEN RETURN 0.00; END IF;
    RETURN ROUND(100 * v_occupied / v_capacity,2);
END$$

-- Function 3: Total Complaints Filed by a Student
CREATE FUNCTION TotalComplaintsOfStudent(p_student_id INT) RETURNS INT NOT DETERMINISTIC READS SQL DATA
BEGIN
    DECLARE v_count INT;
    SELECT COUNT(*) INTO v_count FROM Complaint WHERE student_id = p_student_id;
    RETURN v_count;
END$$

-- Function 4: Active Student Count in a Mess
CREATE FUNCTION CountStudentsInMess(p_mess_id INT) RETURNS INT NOT DETERMINISTIC READS SQL DATA
BEGIN
    DECLARE v_count INT;
    SELECT COUNT(*) INTO v_count FROM MessRegistration WHERE mess_id = p_mess_id AND status = 'Active';
    RETURN v_count;
END$$

DELIMITER ;

-- ------------------------------------------------------------------------------
-- 5. PL/SQL STORED PROCEDURES
-- ------------------------------------------------------------------------------

DELIMITER $$

-- Procedure 1: Safe Room Allocation with Bed Capacity Verification
CREATE PROCEDURE AllocateRoom(IN p_student_id INT, IN p_room_id INT)
BEGIN
    DECLARE v_available INT; 
    DECLARE v_existing INT;
    START TRANSACTION;
    
    SELECT COUNT(*) INTO v_existing FROM RoomAllocation WHERE student_id = p_student_id AND status = 'Active';
    IF v_existing > 0 THEN 
        ROLLBACK; 
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Student already has an active room allocation.'; 
    END IF;
    
    SET v_available = AvailableBeds(p_room_id);
    IF v_available IS NULL THEN 
        ROLLBACK; 
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Specified room does not exist.'; 
    ELSEIF v_available <= 0 THEN 
        ROLLBACK; 
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No available beds remaining in this room.'; 
    END IF;
    
    INSERT INTO RoomAllocation (student_id, room_id, allocation_date, status) 
    VALUES (p_student_id, p_room_id, CURDATE(), 'Active');
    
    COMMIT;
END$$

-- Procedure 2: Safe Room Vacate Procedure
CREATE PROCEDURE VacateRoom(IN p_allocation_id INT)
BEGIN
    START TRANSACTION;
    UPDATE RoomAllocation 
    SET status = 'Vacated', vacate_date = CURDATE() 
    WHERE allocation_id = p_allocation_id AND status = 'Active';
    COMMIT;
END$$

-- Procedure 3: Register / Switch Student Mess
CREATE PROCEDURE RegisterMess(IN p_student_id INT, IN p_mess_id INT)
BEGIN
    START TRANSACTION;
    -- End existing active mess registration if any
    UPDATE MessRegistration 
    SET status = 'Ended', end_date = CURDATE() 
    WHERE student_id = p_student_id AND status = 'Active';
    
    -- Insert new active mess registration
    INSERT INTO MessRegistration (student_id, mess_id, registration_date, status) 
    VALUES (p_student_id, p_mess_id, CURDATE(), 'Active');
    
    COMMIT;
END$$

-- Procedure 4: Register Student Complaint
CREATE PROCEDURE RegisterComplaint(IN p_student_id INT, IN p_type_name VARCHAR(50), IN p_description VARCHAR(500))
BEGIN
    DECLARE v_type_id INT;
    SELECT complaint_type_id INTO v_type_id FROM ComplaintType WHERE type_name = p_type_name;
    IF v_type_id IS NULL THEN 
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unknown complaint type specified.'; 
    END IF;
    
    INSERT INTO Complaint (student_id, complaint_type_id, complaint_date, description, status) 
    VALUES (p_student_id, v_type_id, CURDATE(), p_description, 'Pending');
END$$

-- Procedure 5: Update Complaint Status with Warden Remarks
CREATE PROCEDURE UpdateComplaintStatus(IN p_complaint_id INT, IN p_status VARCHAR(20), IN p_remarks VARCHAR(255))
BEGIN
    IF p_status = 'Resolved' THEN
        UPDATE Complaint 
        SET status = p_status, remarks = p_remarks, resolved_date = CURDATE() 
        WHERE complaint_id = p_complaint_id;
    ELSE
        UPDATE Complaint 
        SET status = p_status, remarks = p_remarks 
        WHERE complaint_id = p_complaint_id;
    END IF;
END$$

-- Procedure 6: Record Mess Fee Payment
CREATE PROCEDURE PayMessFee(IN p_mess_reg_id INT, IN p_amount DECIMAL(8,2), IN p_month CHAR(7), IN p_mode VARCHAR(20))
BEGIN
    INSERT INTO MessFeePayment (mess_reg_id, payment_date, amount_paid, payment_month, payment_mode)
    VALUES (p_mess_reg_id, CURDATE(), p_amount, p_month, p_mode);
END$$

DELIMITER ;

-- ------------------------------------------------------------------------------
-- 6. FULL POPULATION OF SAMPLE DATA
-- ------------------------------------------------------------------------------

-- Insert Students (Including Garvit Kaushik 25BCE5689 & Peer batchmates)
INSERT INTO Student (student_id, reg_no, full_name, course, branch, year_of_study, gender, phone_number, email, parent_name, parent_contact) VALUES
(1, '25BCE5689', 'Garvit Kaushik', 'B.Tech', 'CSE', 2, 'Male', '9876543201', 'garvit.kaushik@vitstudent.ac.in', 'Suresh Kaushik', '9876500001'),
(2, '25BCE5124', 'Aarav Sharma', 'B.Tech', 'CSE', 2, 'Male', '9876543202', 'aarav.sharma@vitstudent.ac.in', 'Ramesh Sharma', '9876500002'),
(3, '24BCE1048', 'Priya Verma', 'B.Tech', 'ECE', 3, 'Female', '9876543203', 'priya.verma@vitstudent.ac.in', 'Suman Verma', '9876500003'),
(4, '25BCE5783', 'Rohan Gupta', 'B.Tech', 'ME', 2, 'Male', '9876543204', 'rohan.gupta@vitstudent.ac.in', 'Dinesh Gupta', '9876500004'),
(5, '24BCE2031', 'Ananya Patel', 'B.Tech', 'IT', 3, 'Female', '9876543205', 'ananya.patel@vitstudent.ac.in', 'Kishore Patel', '9876500005'),
(6, '23BCE0155', 'Vikram Aditya', 'B.Tech', 'CSE', 4, 'Male', '9876543206', 'vikram.aditya@vitstudent.ac.in', 'Mahesh Aditya', '9876500006'),
(7, '25BCE3410', 'Neha Singhania', 'B.Tech', 'EEE', 2, 'Female', '9876543207', 'neha.singhania@vitstudent.ac.in', 'Alok Singhania', '9876500007'),
(8, '24BCE4590', 'Kabir Mehta', 'B.Tech', 'Civil', 3, 'Male', '9876543208', 'kabir.mehta@vitstudent.ac.in', 'Sanjay Mehta', '9876500008'),
(9, '26BCE0042', 'Rhea Chakraborty', 'B.Tech', 'Biotech', 1, 'Female', '9876543209', 'rhea.c@vitstudent.ac.in', 'Subhash Chakraborty', '9876500009'),
(10, '26BCE0188', 'Tanmay Joshi', 'B.Tech', 'CSE', 1, 'Male', '9876543210', 'tanmay.joshi@vitstudent.ac.in', 'Vijay Joshi', '9876500010'),
(11, '23BCE0912', 'Sneha Nair', 'B.Tech', 'ECE', 4, 'Female', '9876543211', 'sneha.nair@vitstudent.ac.in', 'Radhakrishnan Nair', '9876500011'),
(12, '25BCE6011', 'Aditya Iyer', 'B.Tech', 'CSE', 2, 'Male', '9876543212', 'aditya.iyer@vitstudent.ac.in', 'Ganesh Iyer', '9876500012');

-- Insert Hostels
INSERT INTO Hostel (hostel_id, hostel_name, hostel_type, warden_name, warden_contact) VALUES
(1, 'Hostel Block A', 'Boys', 'Dr. Rajesh Nair', '9444100101'),
(2, 'Hostel Block B', 'Boys', 'Prof. Sunil Sundaram', '9444100102'),
(3, 'Hostel Block C', 'Girls', 'Dr. Meenakshi Raman', '9444100103'),
(4, 'Hostel Block D', 'Girls', 'Prof. Shobhana Devi', '9444100104');

-- Insert Blocks
INSERT INTO Block (block_id, hostel_id, block_name) VALUES
(1, 1, 'Block 1'),
(2, 1, 'Block 2'),
(3, 2, 'Block A'),
(4, 3, 'Block G1'),
(5, 4, 'Block G2');

-- Insert Floors
INSERT INTO Floor (floor_id, block_id, floor_number) VALUES
(1, 1, 0), -- Ground Floor Block 1
(2, 1, 1), -- First Floor Block 1
(3, 1, 2), -- Second Floor Block 1
(4, 2, 1), -- First Floor Block 2
(5, 3, 1), -- First Floor Block A
(6, 4, 1), -- First Floor Block G1
(7, 5, 1); -- First Floor Block G2

-- Insert Room Types
INSERT INTO RoomType (room_type_id, capacity, ac_type, fee_per_semester) VALUES
(1, 1, 'AC', 78000.00),
(2, 2, 'AC', 56000.00),
(3, 2, 'Non-AC', 42000.00),
(4, 3, 'AC', 48000.00),
(5, 3, 'Non-AC', 36000.00),
(6, 4, 'AC', 40000.00),
(7, 4, 'Non-AC', 29000.00),
(8, 6, 'Non-AC', 22000.00);

-- Insert Rooms
INSERT INTO Room (room_id, floor_id, room_type_id, room_number, current_occupancy, is_active) VALUES
(1, 1, 2, 'G01', 0, TRUE), -- 2 Bed AC
(2, 1, 3, 'G02', 0, TRUE), -- 2 Bed Non-AC
(3, 2, 4, '101', 0, TRUE), -- 3 Bed AC
(4, 2, 5, '102', 0, TRUE), -- 3 Bed Non-AC
(5, 3, 6, '201', 0, TRUE), -- 4 Bed AC
(6, 4, 2, '105', 0, TRUE), -- 2 Bed AC
(7, 5, 7, '110', 0, TRUE), -- 4 Bed Non-AC
(8, 6, 2, 'G101', 0, TRUE), -- Girls 2 Bed AC
(9, 6, 5, 'G102', 0, TRUE), -- Girls 3 Bed Non-AC
(10, 7, 6, 'G201', 0, TRUE); -- Girls 4 Bed AC

-- Insert Caterers
INSERT INTO Caterer (caterer_id, caterer_name, contact_person, contact_number, contract_start_date, contract_end_date) VALUES
(1, 'Annapoorna Hospitality Services', 'Mr. S. Venkatraman', '9840112233', '2026-01-01', '2027-12-31'),
(2, 'Royal Feast Gourmet Caterers', 'Mr. Gurpreet Singh', '9840223344', '2026-01-01', '2027-12-31'),
(3, 'Green Leaf Nutrition Mess Services', 'Ms. Anita Swaminathan', '9840334455', '2026-01-01', '2027-12-31');

-- Insert Messes
INSERT INTO Mess (mess_id, hostel_id, caterer_id, mess_name, mess_category, monthly_fee, capacity) VALUES
(1, 1, 1, 'Block A Dining - Veg', 'Veg', 5200.00, 350),
(2, 1, 2, 'Block A Dining - Non-Veg', 'Non-Veg', 6200.00, 400),
(3, 2, 2, 'Block B Dining - Multi-Cuisine', 'Special', 6800.00, 300),
(4, 3, 3, 'Block C Dining - Veg', 'Veg', 5300.00, 450),
(5, 4, 2, 'Block D Dining - Non-Veg', 'Non-Veg', 6300.00, 350);

-- Insert Complaint Types
INSERT INTO ComplaintType (complaint_type_id, type_name, category) VALUES
(1, 'Electrical Breakdown', 'Hostel'),
(2, 'Plumbing & Water Supply', 'Hostel'),
(3, 'Furniture / Bed Repair', 'Hostel'),
(4, 'Air Conditioner Malfunction', 'Hostel'),
(5, 'Food Quality & Taste', 'Mess'),
(6, 'Mess Hygiene & Cleanliness', 'Mess'),
(7, 'Drinking Water Dispenser', 'Mess'),
(8, 'Late Meal Serving', 'Mess');

-- Insert Room Allocations (Triggers will adjust room occupancy automatically)
INSERT INTO RoomAllocation (allocation_id, student_id, room_id, allocation_date, vacate_date, status) VALUES
(1, 1, 1, '2026-07-10', NULL, 'Active'), -- Garvit Kaushik in Room G01 (2-Bed AC)
(2, 2, 1, '2026-07-10', NULL, 'Active'), -- Aarav Sharma in Room G01 (2-Bed AC, now full)
(3, 3, 8, '2026-07-11', NULL, 'Active'), -- Priya Verma in Room G101 (Girls 2-Bed AC)
(4, 4, 3, '2026-07-11', NULL, 'Active'), -- Rohan Gupta in Room 101 (3-Bed AC)
(5, 5, 8, '2026-07-12', NULL, 'Active'), -- Ananya Patel in Room G101 (Girls 2-Bed AC, now full)
(6, 6, 3, '2026-07-12', NULL, 'Active'), -- Vikram Aditya in Room 101 (3-Bed AC)
(7, 7, 9, '2026-07-13', NULL, 'Active'), -- Neha Singhania in Room G102 (Girls 3-Bed Non-AC)
(8, 8, 4, '2026-07-13', NULL, 'Active'), -- Kabir Mehta in Room 102 (3-Bed Non-AC)
(9, 10, 5, '2026-07-14', NULL, 'Active'), -- Tanmay Joshi in Room 201 (4-Bed AC)
(10, 11, 9, '2026-07-14', NULL, 'Active'), -- Sneha Nair in Room G102 (Girls 3-Bed Non-AC)
(11, 12, 7, '2026-07-15', NULL, 'Active'); -- Aditya Iyer in Room 110 (4-Bed Non-AC)

-- Insert Past Vacated Room Allocations (History records)
INSERT INTO RoomAllocation (allocation_id, student_id, room_id, allocation_date, vacate_date, status) VALUES
(12, 6, 2, '2025-07-15', '2026-05-20', 'Vacated'),
(13, 8, 2, '2025-07-15', '2026-05-20', 'Vacated');

-- Insert Mess Registrations
INSERT INTO MessRegistration (mess_reg_id, student_id, mess_id, registration_date, end_date, status) VALUES
(1, 1, 2, '2026-07-10', NULL, 'Active'), -- Garvit -> Non-Veg Mess
(2, 2, 1, '2026-07-10', NULL, 'Active'), -- Aarav -> Veg Mess
(3, 3, 4, '2026-07-11', NULL, 'Active'), -- Priya -> Girls Veg Mess
(4, 4, 3, '2026-07-11', NULL, 'Active'), -- Rohan -> Special Mess
(5, 5, 5, '2026-07-12', NULL, 'Active'), -- Ananya -> Girls Non-Veg Mess
(6, 6, 2, '2026-07-12', NULL, 'Active'), -- Vikram -> Non-Veg Mess
(7, 7, 4, '2026-07-13', NULL, 'Active'), -- Neha -> Girls Veg Mess
(8, 8, 1, '2026-07-13', NULL, 'Active'), -- Kabir -> Veg Mess
(9, 9, 4, '2026-07-14', NULL, 'Active'), -- Rhea -> Girls Veg Mess
(10, 10, 3, '2026-07-14', NULL, 'Active'), -- Tanmay -> Special Mess
(11, 11, 5, '2026-07-14', NULL, 'Active'), -- Sneha -> Girls Non-Veg Mess
(12, 12, 2, '2026-07-15', NULL, 'Active'); -- Aditya -> Non-Veg Mess

-- Insert Weekly Mess Menus (Hostel A Veg & Non-Veg)
INSERT INTO MessMenu (menu_id, mess_id, week_start_date, day_of_week, meal_type) VALUES
(1, 1, '2026-10-05', 'Monday', 'Breakfast'),
(2, 1, '2026-10-05', 'Monday', 'Lunch'),
(3, 1, '2026-10-05', 'Monday', 'Snacks'),
(4, 1, '2026-10-05', 'Monday', 'Dinner'),
(5, 1, '2026-10-05', 'Tuesday', 'Breakfast'),
(6, 1, '2026-10-05', 'Tuesday', 'Lunch'),
(7, 1, '2026-10-05', 'Wednesday', 'Lunch'),
(8, 1, '2026-10-05', 'Sunday', 'Dinner'),
(9, 2, '2026-10-05', 'Monday', 'Breakfast'),
(10, 2, '2026-10-05', 'Monday', 'Lunch'),
(11, 2, '2026-10-05', 'Monday', 'Dinner'),
(12, 2, '2026-10-05', 'Wednesday', 'Dinner');

-- Insert Menu Items
INSERT INTO MenuItem (menu_id, item_name) VALUES
(1, 'Idli & Medu Vada'),
(1, 'Coconut Chutney & Sambar'),
(1, 'Filter Coffee / Tea'),
(2, 'Steamed Rice & Dal Tadka'),
(2, 'Paneer Butter Masala'),
(2, 'Chapati & Salad'),
(2, 'Curd & Pickle'),
(3, 'Veg Samosa & Mint Chutney'),
(3, 'Hot Ginger Tea'),
(4, 'Tawa Roti & Dal Makhani'),
(4, 'Jeera Rice & Aloo Gobi'),
(4, 'Gulab Jamun'),
(5, 'Masala Dosa with Sambar'),
(6, 'South Indian Meals with Rasam'),
(7, 'Chole Bhature & Boondi Raita'),
(8, 'Special Shahi Paneer & Pulao'),
(9, 'Egg Bhurji / Boiled Eggs & Toast'),
(10, 'Chicken Curry & Steamed Rice'),
(11, 'Chicken Biryani & Onion Raita'),
(12, 'Butter Chicken & Butter Naan');

-- Insert Meal Attendance
INSERT INTO MealAttendance (mess_reg_id, attendance_date, meal_type) VALUES
(1, '2026-10-05', 'Breakfast'),
(1, '2026-10-05', 'Lunch'),
(1, '2026-10-05', 'Dinner'),
(2, '2026-10-05', 'Breakfast'),
(2, '2026-10-05', 'Lunch'),
(3, '2026-10-05', 'Breakfast'),
(3, '2026-10-05', 'Lunch'),
(4, '2026-10-05', 'Dinner'),
(5, '2026-10-05', 'Lunch'),
(6, '2026-10-05', 'Dinner'),
(1, '2026-10-06', 'Breakfast'),
(1, '2026-10-06', 'Lunch');

-- Insert Mess Fee Payments
INSERT INTO MessFeePayment (mess_reg_id, payment_date, amount_paid, payment_month, payment_mode) VALUES
(1, '2026-09-02', 6200.00, '2026-09', 'Online'),
(1, '2026-10-03', 6200.00, '2026-10', 'Online'),
(2, '2026-09-01', 5200.00, '2026-09', 'Online'),
(2, '2026-10-02', 5200.00, '2026-10', 'Card'),
(3, '2026-09-03', 5300.00, '2026-09', 'Online'),
(3, '2026-10-04', 5300.00, '2026-10', 'Online'),
(4, '2026-09-05', 6800.00, '2026-09', 'Cash'),
(5, '2026-09-04', 6300.00, '2026-09', 'Online'),
(6, '2026-09-02', 6200.00, '2026-09', 'Online'),
(7, '2026-09-03', 5300.00, '2026-09', 'Online'),
(10, '2026-09-05', 6800.00, '2026-09', 'Card'),
(12, '2026-09-01', 6200.00, '2026-09', 'Online');

-- Insert Complaints
INSERT INTO Complaint (complaint_id, student_id, complaint_type_id, complaint_date, description, status, resolved_date, remarks) VALUES
(1, 1, 4, '2026-10-07', 'AC thermostat in room G01 not cooling below 26C.', 'In Progress', NULL, 'Technician assigned from facilities team.'),
(2, 2, 2, '2026-10-06', 'Bathroom faucet leaking in washroom near G01.', 'Resolved', '2026-10-08', 'Washer replaced by plumber Ramesh.'),
(3, 4, 1, '2026-10-08', 'Study table light socket has loose contact.', 'Pending', NULL, NULL),
(4, 5, 5, '2026-10-05', 'Rice was undercooked during dinner service on Sunday.', 'Resolved', '2026-10-06', 'Caterer supervisor notified and replaced batch.'),
(5, 7, 7, '2026-10-07', 'Cold water dispenser on 1st floor running warm.', 'Pending', NULL, NULL),
(6, 8, 3, '2026-10-09', 'Cupboard latch broken in room 102.', 'In Progress', NULL, 'Carpenter scheduled for inspection.'),
(7, 10, 6, '2026-10-08', 'Dining tables not cleaned between lunch batches.', 'Pending', NULL, NULL);

-- Insert Mess Feedback
INSERT INTO MessFeedback (feedback_id, student_id, mess_id, feedback_date, rating, comments) VALUES
(1, 1, 2, '2026-10-04', 4, 'Non-veg biryani on Mondays is excellent. Good portion sizes.'),
(2, 2, 1, '2026-10-05', 5, 'Very hygienic food and punctual breakfast timings.'),
(3, 3, 4, '2026-10-06', 4, 'Good healthy options and fresh salads everyday.'),
(4, 4, 3, '2026-10-06', 3, 'Food is decent, but dinner rush causes long queue.'),
(5, 5, 5, '2026-10-07', 2, 'Rice was not cooked properly earlier this week, need better quality check.'),
(6, 6, 2, '2026-10-07', 5, 'Great variety in weekly rotation. Friendly staff.'),
(7, 10, 3, '2026-10-08', 4, 'North Indian paneer dishes are top tier.');

-- ==============================================================================
-- END OF INITIALIZATION SCRIPT
-- ==============================================================================

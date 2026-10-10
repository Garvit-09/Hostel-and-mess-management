-- ==============================================================================
-- HOSTEL & MESS MANAGEMENT SYSTEM (DA2 DATABASE QUERIES & PL/SQL EXECUTION)
-- Student: Garvit Kaushik (Reg No: 25BCE5689)
-- Contains: Advanced SQL (Joins, Subqueries, Aggregations, Window Functions, Views)
--           and PL/SQL Stored Routines (Stored Functions & Procedures)
-- ==============================================================================

USE hostel_mess_management;

-- ------------------------------------------------------------------------------
-- QUERY 1: Active Student Room Allocations with Complete Hierarchy
-- Category: Multi-Table Inner Join (5 Tables) & View Demonstration
-- Purpose: Retrieve all active residents of Hostel A with complete block, floor,
--          room type, and air conditioning details.
-- ------------------------------------------------------------------------------
SELECT 
    s.reg_no,
    s.full_name,
    s.branch,
    s.year_of_study,
    h.hostel_name,
    bl.block_name,
    fl.floor_number,
    r.room_number,
    rt.capacity,
    rt.ac_type,
    ra.allocation_date
FROM Student s
JOIN RoomAllocation ra ON ra.student_id = s.student_id AND ra.status = 'Active'
JOIN Room r ON r.room_id = ra.room_id
JOIN Floor fl ON fl.floor_id = r.floor_id
JOIN Block bl ON bl.block_id = fl.block_id
JOIN Hostel h ON h.hostel_id = bl.hostel_id
JOIN RoomType rt ON rt.room_type_id = r.room_type_id
ORDER BY h.hostel_name, r.room_number;


-- ------------------------------------------------------------------------------
-- QUERY 2: Hostel Occupancy Analytics & Capacity Utilization
-- Category: Aggregations & View Query (HostelOccupancy)
-- Purpose: Calculate total block count, total rooms, aggregate capacity, 
--          current occupancy, and occupancy percentage per hostel.
-- ------------------------------------------------------------------------------
SELECT 
    hostel_id,
    hostel_name,
    hostel_type,
    total_blocks,
    total_rooms,
    total_bed_capacity,
    current_occupancy,
    occupancy_percentage
FROM HostelOccupancy
ORDER BY occupancy_percentage DESC;


-- ------------------------------------------------------------------------------
-- QUERY 3: Available Beds per Room (Calling PL/SQL Stored Function)
-- Category: PL/SQL Stored Function Execution (AvailableBeds)
-- Purpose: Calls user-defined scalar function AvailableBeds(room_id) to find
--          rooms that currently have vacant beds for new admissions.
-- ------------------------------------------------------------------------------
SELECT 
    r.room_id,
    r.room_number,
    rt.capacity,
    r.current_occupancy,
    AvailableBeds(r.room_id) AS vacant_beds,
    rt.ac_type,
    rt.fee_per_semester
FROM Room r
JOIN RoomType rt ON rt.room_type_id = r.room_type_id
WHERE AvailableBeds(r.room_id) > 0
ORDER BY vacant_beds DESC, r.room_number;


-- ------------------------------------------------------------------------------
-- QUERY 4: Unresolved Complaints with Aging Calculation
-- Category: View & Date Arithmetic Function (DATEDIFF)
-- Purpose: Monitor pending and in-progress grievances, showing student details,
--          complaint category, and the exact number of days open.
-- ------------------------------------------------------------------------------
SELECT 
    complaint_id,
    reg_no,
    full_name,
    category,
    type_name,
    complaint_date,
    days_open,
    status,
    description
FROM PendingComplaints
ORDER BY days_open DESC;


-- ------------------------------------------------------------------------------
-- QUERY 5: Complaint Frequency Breakdown by Category & Status
-- Category: Aggregations, GROUP BY & Conditional Aggregation
-- Purpose: Executive summary of complaints classified across Hostel vs Mess.
-- ------------------------------------------------------------------------------
SELECT 
    ct.category,
    COUNT(c.complaint_id) AS total_complaints,
    SUM(CASE WHEN c.status = 'Pending' THEN 1 ELSE 0 END) AS pending_count,
    SUM(CASE WHEN c.status = 'In Progress' THEN 1 ELSE 0 END) AS in_progress_count,
    SUM(CASE WHEN c.status = 'Resolved' THEN 1 ELSE 0 END) AS resolved_count
FROM ComplaintType ct
LEFT JOIN Complaint c ON c.complaint_type_id = ct.complaint_type_id
GROUP BY ct.category;


-- ------------------------------------------------------------------------------
-- QUERY 6: Identify Frequent Complainants (PL/SQL Stored Function)
-- Category: PL/SQL Function (TotalComplaintsOfStudent) & HAVING Clause
-- Purpose: Invokes TotalComplaintsOfStudent(student_id) to inspect students who
--          have raised grievances and their respective complaint counts.
-- ------------------------------------------------------------------------------
SELECT 
    s.student_id,
    s.reg_no,
    s.full_name,
    s.branch,
    s.phone_number,
    TotalComplaintsOfStudent(s.student_id) AS grievance_count
FROM Student s
HAVING grievance_count > 0
ORDER BY grievance_count DESC;


-- ------------------------------------------------------------------------------
-- QUERY 7: Rooms at 100% Capacity (Fully Occupied)
-- Category: Relational Comparison & Capacity Check
-- Purpose: Identify rooms where current occupancy matches or exceeds maximum capacity.
-- ------------------------------------------------------------------------------
SELECT 
    r.room_id,
    r.room_number,
    rt.capacity,
    r.current_occupancy,
    rt.ac_type,
    'Fully Occupied' AS occupancy_status
FROM Room r
JOIN RoomType rt ON rt.room_type_id = r.room_type_id
WHERE r.current_occupancy >= rt.capacity;


-- ------------------------------------------------------------------------------
-- QUERY 8: Weekly Mess Menu Schedule with Concatenated Items
-- Category: String Aggregation (GROUP_CONCAT) & Custom Field Ordering
-- Purpose: Formats the entire menu for a specific mess by meal type and day.
-- ------------------------------------------------------------------------------
SELECT 
    mm.day_of_week,
    mm.meal_type,
    GROUP_CONCAT(mi.item_name ORDER BY mi.menu_item_id SEPARATOR ', ') AS served_menu
FROM MessMenu mm
JOIN MenuItem mi ON mi.menu_id = mm.menu_id
WHERE mm.mess_id = 1
GROUP BY mm.menu_id, mm.day_of_week, mm.meal_type
ORDER BY FIELD(mm.day_of_week, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'),
         FIELD(mm.meal_type, 'Breakfast', 'Lunch', 'Snacks', 'Dinner');


-- ------------------------------------------------------------------------------
-- QUERY 9: Compare Monday Dinner Offerings Across Mess Facilities
-- Category: Multi-table Join with Filtering
-- Purpose: Comparison report for students to see what each mess serves on Monday nights.
-- ------------------------------------------------------------------------------
SELECT 
    m.mess_name,
    m.mess_category,
    mi.item_name
FROM Mess m
JOIN MessMenu mm ON mm.mess_id = m.mess_id
JOIN MenuItem mi ON mi.menu_id = mm.menu_id
WHERE mm.day_of_week = 'Monday' AND mm.meal_type = 'Dinner'
ORDER BY m.mess_id, mi.menu_item_id;


-- ------------------------------------------------------------------------------
-- QUERY 10: Student Meal Attendance Audit for Current Week
-- Category: Aggregations & Multi-Table Relationship
-- Purpose: Quantify dining hall visits per student to audit mess utilization.
-- ------------------------------------------------------------------------------
SELECT 
    s.reg_no,
    s.full_name,
    m.mess_name,
    COUNT(ma.attendance_id) AS total_meals_consumed
FROM Student s
JOIN MessRegistration mr ON mr.student_id = s.student_id AND mr.status = 'Active'
JOIN Mess m ON m.mess_id = mr.mess_id
JOIN MealAttendance ma ON ma.mess_reg_id = mr.mess_reg_id
GROUP BY s.student_id, s.reg_no, s.full_name, m.mess_name
ORDER BY total_meals_consumed DESC;


-- ------------------------------------------------------------------------------
-- QUERY 11: Defaulters List - Active Students with Unpaid Mess Fees for Current Month
-- Category: Correlated Subquery with NOT EXISTS
-- Purpose: Identifies students registered to a mess who haven't paid fees for '2026-10'.
-- ------------------------------------------------------------------------------
SELECT 
    s.reg_no,
    s.full_name,
    s.phone_number,
    m.mess_name,
    m.monthly_fee AS fee_due,
    'Unpaid (2026-10)' AS payment_status
FROM MessRegistration mr
JOIN Student s ON s.student_id = mr.student_id
JOIN Mess m ON m.mess_id = mr.mess_id
WHERE mr.status = 'Active'
  AND NOT EXISTS (
      SELECT 1 
      FROM MessFeePayment mfp 
      WHERE mfp.mess_reg_id = mr.mess_reg_id 
        AND mfp.payment_month = '2026-10'
  )
ORDER BY s.reg_no;


-- ------------------------------------------------------------------------------
-- QUERY 12: Financial Revenue & Transaction Audit per Mess
-- Category: Financial Rollup & View Analysis (MessRevenueSummary)
-- Purpose: Aggregate total tuition/mess fee collections and total transaction count.
-- ------------------------------------------------------------------------------
SELECT 
    mess_id,
    mess_name,
    mess_category,
    total_fee_collected,
    total_transactions
FROM MessRevenueSummary
ORDER BY total_fee_collected DESC;


-- ------------------------------------------------------------------------------
-- QUERY 13: Caterer Performance & Average Feedback Rating
-- Category: Aggregation with Decimal Rounding (ROUND, AVG)
-- Purpose: Evaluates catering contractors based on student feedback scores (1-5 scale).
-- ------------------------------------------------------------------------------
SELECT 
    m.mess_id,
    m.mess_name,
    c.caterer_name,
    ROUND(AVG(mf.rating), 2) AS average_rating,
    COUNT(mf.feedback_id) AS total_reviews_received
FROM Mess m
JOIN Caterer c ON c.caterer_id = m.caterer_id
LEFT JOIN MessFeedback mf ON mf.mess_id = m.mess_id
GROUP BY m.mess_id, m.mess_name, c.caterer_name
ORDER BY average_rating DESC;


-- ------------------------------------------------------------------------------
-- QUERY 14: Headcount per Mess using PL/SQL Stored Function
-- Category: PL/SQL Stored Function (CountStudentsInMess)
-- Purpose: Verifies mess capacity limits using the CountStudentsInMess scalar function.
-- ------------------------------------------------------------------------------
SELECT 
    m.mess_id,
    m.mess_name,
    m.capacity AS max_seating_capacity,
    CountStudentsInMess(m.mess_id) AS active_registered_students,
    (m.capacity - CountStudentsInMess(m.mess_id)) AS remaining_seats
FROM Mess m
ORDER BY active_registered_students DESC;


-- ------------------------------------------------------------------------------
-- QUERY 15: Students with Impeccable Record (No Complaints Filed)
-- Category: LEFT JOIN with NULL Check (Anti-Join Pattern)
-- Purpose: Finds disciplined residents who haven't filed any complaints.
-- ------------------------------------------------------------------------------
SELECT 
    s.student_id,
    s.reg_no,
    s.full_name,
    s.branch,
    s.email
FROM Student s
LEFT JOIN Complaint c ON c.student_id = s.student_id
WHERE c.complaint_id IS NULL
ORDER BY s.student_id;


-- ------------------------------------------------------------------------------
-- QUERY 16: Rank Hostels by Occupancy Utilizing Window Function
-- Category: Advanced SQL Window Function (RANK() OVER PARTITION/ORDER)
-- Purpose: Evaluates occupancy distribution and assigns dense ranking across hostels.
-- ------------------------------------------------------------------------------
SELECT 
    hostel_name,
    hostel_type,
    current_occupancy,
    total_bed_capacity,
    occupancy_percentage,
    RANK() OVER (ORDER BY occupancy_percentage DESC) AS occupancy_rank
FROM HostelOccupancy;


-- ------------------------------------------------------------------------------
-- QUERY 17: PL/SQL Stored Procedure Execution Demonstration
-- Category: PL/SQL Procedural Call (CALL AllocateRoom / CALL UpdateComplaintStatus)
-- Purpose: Demonstrates execution of transaction-managed business routines.
-- ------------------------------------------------------------------------------
-- Test Procedure: Allocate student 9 to room 4
-- CALL AllocateRoom(9, 4);

-- Test Procedure: Register a new grievance
-- CALL RegisterComplaint(1, 'Air Conditioner Malfunction', 'Compressor cutting off frequently.');

-- Test Procedure: Update complaint status
-- CALL UpdateComplaintStatus(1, 'Resolved', 'Gas refilled and compressor filter replaced.');

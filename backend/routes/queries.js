const express = require('express');
const router = express.Router();
const pool = require('../db');

const queryCatalog = [
  {
    id: 1,
    title: 'Active Student Room Allocations (5-Table Join)',
    category: 'Relational Joins & Views',
    description: 'Retrieves all active hostel residents with their complete hostel name, block, floor number, room type, capacity, and air conditioning details.',
    sql: `SELECT 
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
ORDER BY h.hostel_name, r.room_number;`
  },
  {
    id: 2,
    title: 'Hostel Occupancy & Capacity Utilization',
    category: 'Aggregations & Views',
    description: 'Summarizes block count, room count, total bed capacity, current occupants, and calculated occupancy percentage across all hostels using the HostelOccupancy view.',
    sql: `SELECT 
    hostel_id,
    hostel_name,
    hostel_type,
    total_blocks,
    total_rooms,
    total_bed_capacity,
    current_occupancy,
    occupancy_percentage
FROM HostelOccupancy
ORDER BY occupancy_percentage DESC;`
  },
  {
    id: 3,
    title: 'Vacant Beds per Room (PL/SQL Function: AvailableBeds)',
    category: 'PL/SQL Stored Functions',
    description: 'Invokes the user-defined scalar function AvailableBeds(room_id) to calculate exact real-time vacant beds available for new student allotments.',
    sql: `SELECT 
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
ORDER BY vacant_beds DESC, r.room_number;`
  },
  {
    id: 4,
    title: 'Aging Audit of Open Grievances (PendingComplaints View)',
    category: 'Date Functions & Views',
    description: 'Monitors pending and in-progress student grievances, computing open days using DATEDIFF(CURDATE(), complaint_date) sorted by oldest first.',
    sql: `SELECT 
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
ORDER BY days_open DESC;`
  },
  {
    id: 5,
    title: 'Grievance Breakdown by Category & Status',
    category: 'Conditional Aggregations',
    description: 'Computes matrix of complaints partitioned across Hostel and Mess, breaking down Pending, In Progress, and Resolved counts.',
    sql: `SELECT 
    ct.category,
    COUNT(c.complaint_id) AS total_complaints,
    SUM(CASE WHEN c.status = 'Pending' THEN 1 ELSE 0 END) AS pending_count,
    SUM(CASE WHEN c.status = 'In Progress' THEN 1 ELSE 0 END) AS in_progress_count,
    SUM(CASE WHEN c.status = 'Resolved' THEN 1 ELSE 0 END) AS resolved_count
FROM ComplaintType ct
LEFT JOIN Complaint c ON c.complaint_type_id = ct.complaint_type_id
GROUP BY ct.category;`
  },
  {
    id: 6,
    title: 'Frequent Complainants (PL/SQL Function: TotalComplaintsOfStudent)',
    category: 'PL/SQL Stored Functions',
    description: 'Calls stored function TotalComplaintsOfStudent(student_id) with a HAVING clause to identify students with active complaints.',
    sql: `SELECT 
    s.student_id,
    s.reg_no,
    s.full_name,
    s.branch,
    s.phone_number,
    TotalComplaintsOfStudent(s.student_id) AS grievance_count
FROM Student s
HAVING grievance_count > 0
ORDER BY grievance_count DESC;`
  },
  {
    id: 7,
    title: 'Rooms at 100% Maximum Capacity',
    category: 'Capacity Audit',
    description: 'Identifies all rooms where current occupancy matches or exceeds maximum bed capacity.',
    sql: `SELECT 
    r.room_id,
    r.room_number,
    rt.capacity,
    r.current_occupancy,
    rt.ac_type,
    'Fully Occupied' AS occupancy_status
FROM Room r
JOIN RoomType rt ON rt.room_type_id = r.room_type_id
WHERE r.current_occupancy >= rt.capacity;`
  },
  {
    id: 8,
    title: 'Weekly Menu Schedule with Formatted Items (GROUP_CONCAT)',
    category: 'String Aggregation',
    description: 'Leverages GROUP_CONCAT to concatenate multiple menu items into a clean comma-separated list per meal slot for Hostel A Veg Mess.',
    sql: `SELECT 
    mm.day_of_week,
    mm.meal_type,
    GROUP_CONCAT(mi.item_name ORDER BY mi.menu_item_id SEPARATOR ', ') AS served_menu
FROM MessMenu mm
JOIN MenuItem mi ON mi.menu_id = mm.menu_id
WHERE mm.mess_id = 1
GROUP BY mm.menu_id, mm.day_of_week, mm.meal_type
ORDER BY FIELD(mm.day_of_week, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'),
         FIELD(mm.meal_type, 'Breakfast', 'Lunch', 'Snacks', 'Dinner');`
  },
  {
    id: 9,
    title: 'Compare Monday Dinner Offerings Across All Mess Facilities',
    category: 'Cross-Mess Comparison',
    description: 'Compares dining hall dinner options across veg, non-veg, and multi-cuisine facilities.',
    sql: `SELECT 
    m.mess_name,
    m.mess_category,
    mi.item_name
FROM Mess m
JOIN MessMenu mm ON mm.mess_id = m.mess_id
JOIN MenuItem mi ON mi.menu_id = mm.menu_id
WHERE mm.day_of_week = 'Monday' AND mm.meal_type = 'Dinner'
ORDER BY m.mess_id, mi.menu_item_id;`
  },
  {
    id: 10,
    title: 'Student Meal Attendance Audit for Current Week',
    category: 'Usage Audit & Aggregation',
    description: 'Tracks dining hall visits per student to audit mess consumption patterns.',
    sql: `SELECT 
    s.reg_no,
    s.full_name,
    m.mess_name,
    COUNT(ma.attendance_id) AS total_meals_consumed
FROM Student s
JOIN MessRegistration mr ON mr.student_id = s.student_id AND mr.status = 'Active'
JOIN Mess m ON m.mess_id = mr.mess_id
JOIN MealAttendance ma ON ma.mess_reg_id = mr.mess_reg_id
GROUP BY s.student_id, s.reg_no, s.full_name, m.mess_name
ORDER BY total_meals_consumed DESC;`
  },
  {
    id: 11,
    title: 'Mess Fee Defaulters for October 2026 (Correlated NOT EXISTS)',
    category: 'Subqueries & Integrity Check',
    description: 'Identifies active residents registered to a mess who have not yet submitted payment for the current billing cycle (2026-10).',
    sql: `SELECT 
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
ORDER BY s.reg_no;`
  },
  {
    id: 12,
    title: 'Mess Revenue Summary & Transactions (MessRevenueSummary View)',
    category: 'Financial Analytics',
    description: 'Rolls up total fee receipts collected and total payment transactions completed for each mess facility.',
    sql: `SELECT 
    mess_id,
    mess_name,
    mess_category,
    total_fee_collected,
    total_transactions
FROM MessRevenueSummary
ORDER BY total_fee_collected DESC;`
  },
  {
    id: 13,
    title: 'Caterer Rating & Performance Evaluation',
    category: 'Rating Analytics',
    description: 'Averages student satisfaction scores (1 to 5 scale) to benchmark caterer quality and review volume.',
    sql: `SELECT 
    m.mess_id,
    m.mess_name,
    c.caterer_name,
    ROUND(AVG(mf.rating), 2) AS average_rating,
    COUNT(mf.feedback_id) AS total_reviews_received
FROM Mess m
JOIN Caterer c ON c.caterer_id = m.caterer_id
LEFT JOIN MessFeedback mf ON mf.mess_id = m.mess_id
GROUP BY m.mess_id, m.mess_name, c.caterer_name
ORDER BY average_rating DESC;`
  },
  {
    id: 14,
    title: 'Mess Headcount using PL/SQL Function (CountStudentsInMess)',
    category: 'PL/SQL Stored Functions',
    description: 'Calls stored function CountStudentsInMess(mess_id) to verify current enrollment and remaining seats against physical capacity.',
    sql: `SELECT 
    m.mess_id,
    m.mess_name,
    m.capacity AS max_seating_capacity,
    CountStudentsInMess(m.mess_id) AS active_registered_students,
    (m.capacity - CountStudentsInMess(m.mess_id)) AS remaining_seats
FROM Mess m
ORDER BY active_registered_students DESC;`
  },
  {
    id: 15,
    title: 'Students with Clean Record (Zero Complaints)',
    category: 'Anti-Join / NULL Check',
    description: 'Finds students who have maintained a clean record without filing any complaints.',
    sql: `SELECT 
    s.student_id,
    s.reg_no,
    s.full_name,
    s.branch,
    s.email
FROM Student s
LEFT JOIN Complaint c ON c.student_id = s.student_id
WHERE c.complaint_id IS NULL
ORDER BY s.student_id;`
  },
  {
    id: 16,
    title: 'Rank Hostels by Occupancy Rate (Window Function: RANK())',
    category: 'Window Functions',
    description: 'Applies SQL standard window ranking function RANK() OVER (ORDER BY occupancy_percentage DESC) to rank hostels by utilization.',
    sql: `SELECT 
    hostel_name,
    hostel_type,
    current_occupancy,
    total_bed_capacity,
    occupancy_percentage,
    RANK() OVER (ORDER BY occupancy_percentage DESC) AS occupancy_rank
FROM HostelOccupancy;`
  }
];

// Return the catalog of queries
router.get('/list', (_, res) => {
  res.json(queryCatalog);
});

// Run a query by id or custom SQL
router.post('/run', async (req, res) => {
  const { id, customSql } = req.body;
  let targetSql = customSql;
  let queryInfo = null;

  if (id) {
    queryInfo = queryCatalog.find(q => q.id === Number(id));
    if (queryInfo) {
      targetSql = queryInfo.sql;
    }
  }

  if (!targetSql) {
    return res.status(400).json({ error: 'Valid query id or customSql must be provided.' });
  }

  const startTime = Date.now();
  try {
    const [rows] = await pool.query(targetSql);
    const durationMs = Date.now() - startTime;
    const columns = rows && rows.length ? Object.keys(rows[0]) : [];
    res.json({
      success: true,
      queryId: id || null,
      queryTitle: queryInfo ? queryInfo.title : 'Custom SQL Query',
      sql: targetSql,
      durationMs,
      rowCount: rows ? rows.length : 0,
      columns,
      data: rows || []
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message,
      sql: targetSql,
      durationMs: Date.now() - startTime
    });
  }
});

module.exports = router;

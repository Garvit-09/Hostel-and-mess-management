const express = require('express');
const router = express.Router();
const pool = require('../db');

// List all complaints with student, category, and optional facility info
// Supports query filters: ?room_id=X, ?mess_id=Y, ?hostel_id=Z, ?status=Open, ?category=Hostel
router.get('/', async (req, res) => {
  try {
    const { room_id, mess_id, hostel_id, status, category } = req.query;
    const conditions = [];
    const params = [];

    if (room_id) { conditions.push('c.room_id = ?'); params.push(Number(room_id)); }
    if (mess_id) { conditions.push('c.mess_id = ?'); params.push(Number(mess_id)); }
    if (hostel_id) { conditions.push('c.hostel_id = ?'); params.push(Number(hostel_id)); }
    if (status && status !== 'All') {
      if (status === 'Open') { conditions.push("c.status IN ('Pending', 'In Progress')"); }
      else { conditions.push('c.status = ?'); params.push(status); }
    }
    if (category && category !== 'All') { conditions.push('ct.category = ?'); params.push(category); }

    const whereClause = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';

    const [rows] = await pool.query(`
      SELECT c.complaint_id,
             c.student_id,
             s.reg_no,
             s.full_name,
             ct.type_name,
             ct.category,
             DATE_FORMAT(c.complaint_date, '%Y-%m-%d') AS complaint_date,
             c.description,
             c.status,
             DATE_FORMAT(c.resolved_date, '%Y-%m-%d') AS resolved_date,
             c.remarks,
             c.room_id,
             c.mess_id,
             c.hostel_id,
             r.room_number,
             m.mess_name,
             h.hostel_name,
             CASE
               WHEN c.room_id IS NOT NULL THEN 'Room'
               WHEN c.mess_id IS NOT NULL THEN 'Mess'
               WHEN c.hostel_id IS NOT NULL THEN 'Hostel'
               ELSE 'General'
             END AS facility_type,
             CASE
               WHEN c.room_id IS NOT NULL THEN CONCAT('Room ', r.room_number)
               WHEN c.mess_id IS NOT NULL THEN m.mess_name
               WHEN c.hostel_id IS NOT NULL THEN h.hostel_name
               ELSE 'General / Campus-wide'
             END AS facility_name
      FROM Complaint c
      JOIN Student s ON s.student_id = c.student_id
      JOIN ComplaintType ct ON ct.complaint_type_id = c.complaint_type_id
      LEFT JOIN Room r ON r.room_id = c.room_id
      LEFT JOIN Mess m ON m.mess_id = c.mess_id
      LEFT JOIN Hostel h ON h.hostel_id = c.hostel_id
      ${whereClause}
      ORDER BY c.complaint_id DESC`, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List all complaint types (categories)
router.get('/types', async (_, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM ComplaintType ORDER BY category, type_name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// File a new complaint with optional explicit facility association
router.post('/', async (req, res) => {
  const { student_id, complaint_type_id, description, room_id, mess_id, hostel_id } = req.body;
  if (!student_id || !complaint_type_id || !description) {
    return res.status(400).json({ error: 'student_id, complaint_type_id, and description are required' });
  }

  // Enforce at application level that at most one facility is associated
  const facilities = [room_id, mess_id, hostel_id].filter(f => f !== undefined && f !== null && f !== '');
  if (facilities.length > 1) {
    return res.status(400).json({ error: 'A complaint can be explicitly associated with at most one specific facility (Room, Mess, or Hostel).' });
  }

  const rId = room_id ? Number(room_id) : null;
  const mId = mess_id ? Number(mess_id) : null;
  const hId = hostel_id ? Number(hostel_id) : null;

  try {
    const [result] = await pool.execute(
      `INSERT INTO Complaint (student_id, complaint_type_id, description, status, room_id, mess_id, hostel_id) VALUES (?, ?, ?, 'Pending', ?, ?, ?)`,
      [Number(student_id), Number(complaint_type_id), description, rId, mId, hId]
    );
    res.json({ success: true, insertedId: result.insertId, message: 'Complaint registered successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update complaint status & warden remarks (Update)
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { status, remarks } = req.body;
  if (!status) return res.status(400).json({ error: 'status is required' });
  try {
    const [result] = await pool.execute(
      `UPDATE Complaint SET status = ?, remarks = ? WHERE complaint_id = ?`,
      [status, remarks || null, Number(id)]
    );
    res.json({ success: true, affectedRows: result.affectedRows, message: 'Complaint status updated' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete complaint (Delete)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await pool.execute('DELETE FROM Complaint WHERE complaint_id = ?', [Number(id)]);
    res.json({ success: true, affectedRows: result.affectedRows, message: 'Complaint deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;

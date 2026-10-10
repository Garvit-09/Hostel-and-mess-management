const express = require('express');
const router = express.Router();
const pool = require('../db');

// List all complaints with student and category info
router.get('/', async (_, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.complaint_id,
             c.student_id,
             s.reg_no,
             s.full_name,
             ct.type_name,
             ct.category,
             c.complaint_date,
             c.description,
             c.status,
             c.resolved_date,
             c.remarks
      FROM Complaint c
      JOIN Student s ON s.student_id = c.student_id
      JOIN ComplaintType ct ON ct.complaint_type_id = c.complaint_type_id
      ORDER BY c.complaint_id DESC`);
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

// File a new complaint (Insert)
router.post('/', async (req, res) => {
  const { student_id, complaint_type_id, description } = req.body;
  if (!student_id || !complaint_type_id || !description) {
    return res.status(400).json({ error: 'student_id, complaint_type_id, and description are required' });
  }
  try {
    const [result] = await pool.execute(
      `INSERT INTO Complaint (student_id, complaint_type_id, description, status) VALUES (?, ?, ?, 'Pending')`,
      [Number(student_id), Number(complaint_type_id), description]
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

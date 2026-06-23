const express = require('express');
const multer = require('multer');
const path = require('path');
const { pool } = require('../db');
const router = express.Router();

// Multer config — save passport photos to /uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'passport-' + unique + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png/;
    cb(null, allowed.test(path.extname(file.originalname).toLowerCase()));
  }
});

// Submit membership form (only after verified payment)
router.post('/submit', upload.single('passport_photo'), async (req, res) => {
  const {
    payment_reference,
    full_name,
    email,
    phone,
    date_of_birth,
    gender,
    occupation,
    residential_address,
    state_of_origin,
    lga,
    membership_track,
    next_of_kin_name,
    next_of_kin_phone,
    next_of_kin_relationship,
    means_of_id
  } = req.body;

  // Validate required fields
  if (!payment_reference || !full_name || !email || !phone || !residential_address || !membership_track) {
    return res.status(400).json({ success: false, message: 'Required fields missing' });
  }

  try {
    // Verify the payment reference is valid and paid
    const paymentCheck = await pool.query(
      "SELECT * FROM payments WHERE reference = $1 AND payment_type = 'form_purchase' AND status = 'success'",
      [payment_reference]
    );

    if (paymentCheck.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'No verified form purchase payment found for this reference'
      });
    }

    // Check form not already submitted for this reference
    const dupCheck = await pool.query(
      'SELECT id FROM membership_forms WHERE payment_reference = $1',
      [payment_reference]
    );

    if (dupCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'A form has already been submitted for this payment reference'
      });
    }

    const passport_photo_url = req.file ? `/uploads/${req.file.filename}` : null;

    const result = await pool.query(
      `INSERT INTO membership_forms 
        (payment_reference, full_name, email, phone, date_of_birth, gender, occupation,
         residential_address, state_of_origin, lga, membership_track,
         next_of_kin_name, next_of_kin_phone, next_of_kin_relationship,
         passport_photo_url, means_of_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING id`,
      [
        payment_reference, full_name, email, phone, date_of_birth || null,
        gender, occupation, residential_address, state_of_origin, lga,
        membership_track, next_of_kin_name, next_of_kin_phone,
        next_of_kin_relationship, passport_photo_url, means_of_id
      ]
    );

    return res.json({
      success: true,
      message: 'Membership form submitted successfully',
      form_id: result.rows[0].id
    });

  } catch (err) {
    console.error('Form submit error:', err);
    return res.status(500).json({ success: false, message: 'Submission failed. Please try again.' });
  }
});

// GET all submitted forms (admin only — protect with admin key header)
router.get('/all', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_SECRET_KEY) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const result = await pool.query(
      `SELECT mf.*, p.payment_type, p.amount, p.created_at as payment_date
       FROM membership_forms mf
       JOIN payments p ON mf.payment_reference = p.reference
       ORDER BY mf.submitted_at DESC`
    );
    return res.json({ success: true, forms: result.rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch forms' });
  }
});

// GET dashboard stats (admin only)
router.get('/stats', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_SECRET_KEY) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const [forms, payments, dues] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM membership_forms"),
      pool.query("SELECT COUNT(*), SUM(amount) FROM payments WHERE status = 'success'"),
      pool.query("SELECT COUNT(*) FROM yearly_dues WHERE year = EXTRACT(YEAR FROM NOW())")
    ]);

    return res.json({
      success: true,
      stats: {
        total_forms: parseInt(forms.rows[0].count),
        total_payments: parseInt(payments.rows[0].count),
        total_revenue_kobo: parseInt(payments.rows[0].sum || 0),
        yearly_dues_this_year: parseInt(dues.rows[0].count)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Stats fetch failed' });
  }
});

// UPDATE form status (admin approve/reject)
router.patch('/:id/status', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_SECRET_KEY) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const { status } = req.body;
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status' });
  }

  try {
    await pool.query('UPDATE membership_forms SET status = $1 WHERE id = $2', [status, req.params.id]);
    return res.json({ success: true, message: `Form ${status}` });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Update failed' });
  }
});

module.exports = router;

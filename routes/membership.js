const express = require('express');
const { pool } = require('../db');
const router = express.Router();

// Submit school registration form — open to all, no payment check
router.post('/submit', async (req, res) => {
  const {
    payment_reference,
    school_name, school_address, year_established, nature_of_school,
    lga, state, email, whatsapp, proprietor_name, proprietor_phone,
    kg1_m, kg1_f, kg2_m, kg2_f, n1_m, n1_f, n2_m, n2_f, n3_m, n3_f,
    p1_m, p1_f, p2_m, p2_f, p3_m, p3_f, p4_m, p4_f, p5_m, p5_f, p6_m, p6_f,
    jss1_m, jss1_f, jss2_m, jss2_f, jss3_m, jss3_f,
    ss1_m, ss1_f, ss2_m, ss2_f, ss3_m, ss3_f,
    reg_cac, reg_state, reg_napps
  } = req.body;

  if (!school_name || !school_address || !email || !proprietor_name || !proprietor_phone) {
    return res.status(400).json({ success: false, message: 'Required fields missing' });
  }

  // Determine payment status — if a valid paid reference exists, mark as paid
  let payment_status = 'unpaid';
  if (payment_reference && !payment_reference.startsWith('WALK-IN-')) {
    const payCheck = await pool.query(
      "SELECT id FROM payments WHERE reference = $1 AND status = 'success'",
      [payment_reference]
    ).catch(() => ({ rows: [] }));
    if (payCheck.rows.length > 0) payment_status = 'paid';
  }

  try {
    const result = await pool.query(
      `INSERT INTO membership_forms
        (payment_reference, school_name, school_address, year_established, nature_of_school,
         lga, state, email, whatsapp, proprietor_name, proprietor_phone,
         kg1_m, kg1_f, kg2_m, kg2_f, n1_m, n1_f, n2_m, n2_f, n3_m, n3_f,
         p1_m, p1_f, p2_m, p2_f, p3_m, p3_f, p4_m, p4_f, p5_m, p5_f, p6_m, p6_f,
         jss1_m, jss1_f, jss2_m, jss2_f, jss3_m, jss3_f,
         ss1_m, ss1_f, ss2_m, ss2_f, ss3_m, ss3_f,
         reg_cac, reg_state, reg_napps, payment_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
               $12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
               $22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,
               $34,$35,$36,$37,$38,$39,
               $40,$41,$42,$43,$44,$45,
               $46,$47,$48,$49)
       RETURNING id`,
      [
        payment_reference || null,
        school_name, school_address, year_established, nature_of_school,
        lga, state, email, whatsapp, proprietor_name, proprietor_phone,
        kg1_m||0, kg1_f||0, kg2_m||0, kg2_f||0, n1_m||0, n1_f||0, n2_m||0, n2_f||0, n3_m||0, n3_f||0,
        p1_m||0, p1_f||0, p2_m||0, p2_f||0, p3_m||0, p3_f||0, p4_m||0, p4_f||0, p5_m||0, p5_f||0, p6_m||0, p6_f||0,
        jss1_m||0, jss1_f||0, jss2_m||0, jss2_f||0, jss3_m||0, jss3_f||0,
        ss1_m||0, ss1_f||0, ss2_m||0, ss2_f||0, ss3_m||0, ss3_f||0,
        reg_cac||false, reg_state||false, reg_napps||false,
        payment_status
      ]
    );

    return res.json({
      success: true,
      message: 'School registration submitted successfully',
      form_id: result.rows[0].id,
      payment_status
    });

  } catch (err) {
    console.error('Form submit error:', err);
    return res.status(500).json({ success: false, message: 'Submission failed. Please try again.' });
  }
});

// GET all forms (admin)
router.get('/all', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_SECRET_KEY) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  try {
    const result = await pool.query(
      `SELECT mf.*, p.amount as payment_amount, p.created_at as payment_date
       FROM membership_forms mf
       LEFT JOIN payments p ON mf.payment_reference = p.reference
       ORDER BY mf.submitted_at DESC`
    );
    return res.json({ success: true, forms: result.rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch forms' });
  }
});

// GET stats (admin)
router.get('/stats', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_SECRET_KEY) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  try {
    const [forms, paid, unpaid, payments, dues] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM membership_forms"),
      pool.query("SELECT COUNT(*) FROM membership_forms WHERE payment_status = 'paid'"),
      pool.query("SELECT COUNT(*) FROM membership_forms WHERE payment_status = 'unpaid'"),
      pool.query("SELECT COUNT(*), COALESCE(SUM(amount),0) as total FROM payments WHERE status = 'success'"),
      pool.query("SELECT COUNT(*) FROM yearly_dues WHERE year = EXTRACT(YEAR FROM NOW())")
    ]);
    return res.json({
      success: true,
      stats: {
        total_forms: parseInt(forms.rows[0].count),
        paid_forms: parseInt(paid.rows[0].count),
        unpaid_forms: parseInt(unpaid.rows[0].count),
        total_payments: parseInt(payments.rows[0].count),
        total_revenue_kobo: parseInt(payments.rows[0].total || 0),
        yearly_dues_this_year: parseInt(dues.rows[0].count)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Stats fetch failed' });
  }
});

// UPDATE form status OR payment_status (admin)
router.patch('/:id/status', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_SECRET_KEY) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  const { status, payment_status } = req.body;

  try {
    if (payment_status) {
      if (!['paid', 'unpaid'].includes(payment_status)) {
        return res.status(400).json({ success: false, message: 'Invalid payment_status' });
      }
      await pool.query('UPDATE membership_forms SET payment_status = $1 WHERE id = $2', [payment_status, req.params.id]);
    }
    if (status) {
      if (!['pending', 'approved', 'rejected'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
      }
      await pool.query('UPDATE membership_forms SET status = $1 WHERE id = $2', [status, req.params.id]);
    }
    return res.json({ success: true, message: 'Updated successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Update failed' });
  }
});

module.exports = router;

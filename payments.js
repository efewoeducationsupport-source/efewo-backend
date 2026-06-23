const express = require('express');
const axios = require('axios');
const { pool } = require('../db');
const router = express.Router();

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE = 'https://api.paystack.co';

// Initialize payment (form purchase ₦500 or yearly dues ₦10,000)
router.post('/initialize', async (req, res) => {
  const { email, payment_type } = req.body;

  if (!email || !payment_type) {
    return res.status(400).json({ success: false, message: 'Email and payment type are required' });
  }

  const AMOUNTS = {
    form_purchase: 500000,   // ₦5,000 in kobo
    yearly_dues: 1000000    // ₦10,000 in kobo
  };

  const amount = AMOUNTS[payment_type];
  if (!amount) {
    return res.status(400).json({ success: false, message: 'Invalid payment type' });
  }

  try {
    const response = await axios.post(
      `${PAYSTACK_BASE}/transaction/initialize`,
      {
        email,
        amount,
        metadata: { payment_type, email },
        callback_url: `${process.env.FRONTEND_URL}/payment-callback.html`
      },
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );

    const { reference, authorization_url } = response.data.data;

    // Save pending payment to DB
    await pool.query(
      'INSERT INTO payments (email, reference, payment_type, amount, status) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (reference) DO NOTHING',
      [email, reference, payment_type, amount, 'pending']
    );

    return res.json({
      success: true,
      authorization_url,
      reference,
      amount,
      payment_type
    });
  } catch (err) {
    console.error('Paystack init error:', err.response?.data || err.message);
    return res.status(500).json({ success: false, message: 'Payment initialization failed' });
  }
});

// Verify payment after redirect
router.get('/verify/:reference', async (req, res) => {
  const { reference } = req.params;

  try {
    const response = await axios.get(
      `${PAYSTACK_BASE}/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );

    const data = response.data.data;

    if (data.status === 'success') {
      // Update payment status
      await pool.query(
        'UPDATE payments SET status = $1 WHERE reference = $2',
        ['success', reference]
      );

      // Fetch payment details
      const paymentResult = await pool.query(
        'SELECT * FROM payments WHERE reference = $1',
        [reference]
      );

      const payment = paymentResult.rows[0];

      // If yearly dues, log it
      if (payment?.payment_type === 'yearly_dues') {
        const year = new Date().getFullYear();
        await pool.query(
          'INSERT INTO yearly_dues (email, payment_reference, year) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [payment.email, reference, year]
        );
      }

      return res.json({
        success: true,
        payment_type: payment?.payment_type,
        email: payment?.email,
        reference,
        message: 'Payment verified successfully'
      });
    } else {
      await pool.query(
        'UPDATE payments SET status = $1 WHERE reference = $2',
        ['failed', reference]
      );
      return res.status(400).json({ success: false, message: 'Payment not successful' });
    }
  } catch (err) {
    console.error('Paystack verify error:', err.response?.data || err.message);
    return res.status(500).json({ success: false, message: 'Verification failed' });
  }
});

// Check if a reference already submitted a form
router.get('/check-form/:reference', async (req, res) => {
  const { reference } = req.params;
  try {
    const result = await pool.query(
      'SELECT id FROM membership_forms WHERE payment_reference = $1',
      [reference]
    );
    return res.json({ form_submitted: result.rows.length > 0 });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Check failed' });
  }
});

module.exports = router;

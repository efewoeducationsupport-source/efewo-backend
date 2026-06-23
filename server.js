require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { initDB } = require('./db');
const paymentsRouter = require('./routes/payments');
const membershipRouter = require('./routes/membership');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { success: false, message: 'Too many requests, please try again later.' }
});

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-admin-key']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(limiter);

// Serve uploaded passport photos
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/payments', paymentsRouter);
app.use('/api/membership', membershipRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'EESP Backend Online', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// Start server
const start = async () => {
  await initDB();
  app.listen(PORT, () => {
    console.log(`🚀 EESP Server running on port ${PORT}`);
  });
};

start();

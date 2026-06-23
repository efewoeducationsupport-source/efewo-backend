const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const initDB = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        reference VARCHAR(255) UNIQUE NOT NULL,
        payment_type VARCHAR(50) NOT NULL, -- 'form_purchase' or 'yearly_dues'
        amount INTEGER NOT NULL,           -- in kobo
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS membership_forms (
        id SERIAL PRIMARY KEY,
        payment_reference VARCHAR(255) REFERENCES payments(reference),
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        date_of_birth DATE,
        gender VARCHAR(20),
        occupation VARCHAR(255),
        residential_address TEXT NOT NULL,
        state_of_origin VARCHAR(100),
        lga VARCHAR(100),
        membership_track VARCHAR(100) NOT NULL,
        next_of_kin_name VARCHAR(255),
        next_of_kin_phone VARCHAR(20),
        next_of_kin_relationship VARCHAR(100),
        passport_photo_url TEXT,
        means_of_id VARCHAR(100),
        status VARCHAR(50) DEFAULT 'pending',
        submitted_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS yearly_dues (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        payment_reference VARCHAR(255) REFERENCES payments(reference),
        membership_id VARCHAR(100),
        year INTEGER NOT NULL,
        paid_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ Database tables initialized');
  } finally {
    client.release();
  }
};

module.exports = { pool, initDB };

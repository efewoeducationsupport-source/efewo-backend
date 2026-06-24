const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const initDB = async () => {
  const client = await pool.connect();
  try {
    // Create base tables if they don't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        reference VARCHAR(255) UNIQUE NOT NULL,
        payment_type VARCHAR(50) NOT NULL,
        amount INTEGER NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS membership_forms (
        id SERIAL PRIMARY KEY,
        payment_reference VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending',
        submitted_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS yearly_dues (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        payment_reference VARCHAR(255),
        membership_id VARCHAR(100),
        year INTEGER NOT NULL,
        paid_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Add new school registration columns if they don't exist yet
    const newColumns = [
      ['school_name', 'VARCHAR(255)'],
      ['school_address', 'TEXT'],
      ['year_established', 'VARCHAR(10)'],
      ['nature_of_school', 'VARCHAR(100)'],
      ['lga', 'VARCHAR(100)'],
      ['state', 'VARCHAR(100)'],
      ['email', 'VARCHAR(255)'],
      ['whatsapp', 'VARCHAR(20)'],
      ['proprietor_name', 'VARCHAR(255)'],
      ['proprietor_phone', 'VARCHAR(20)'],
      ['kg1_m', 'INT DEFAULT 0'], ['kg1_f', 'INT DEFAULT 0'],
      ['kg2_m', 'INT DEFAULT 0'], ['kg2_f', 'INT DEFAULT 0'],
      ['n1_m', 'INT DEFAULT 0'],  ['n1_f', 'INT DEFAULT 0'],
      ['n2_m', 'INT DEFAULT 0'],  ['n2_f', 'INT DEFAULT 0'],
      ['n3_m', 'INT DEFAULT 0'],  ['n3_f', 'INT DEFAULT 0'],
      ['p1_m', 'INT DEFAULT 0'],  ['p1_f', 'INT DEFAULT 0'],
      ['p2_m', 'INT DEFAULT 0'],  ['p2_f', 'INT DEFAULT 0'],
      ['p3_m', 'INT DEFAULT 0'],  ['p3_f', 'INT DEFAULT 0'],
      ['p4_m', 'INT DEFAULT 0'],  ['p4_f', 'INT DEFAULT 0'],
      ['p5_m', 'INT DEFAULT 0'],  ['p5_f', 'INT DEFAULT 0'],
      ['p6_m', 'INT DEFAULT 0'],  ['p6_f', 'INT DEFAULT 0'],
      ['jss1_m', 'INT DEFAULT 0'], ['jss1_f', 'INT DEFAULT 0'],
      ['jss2_m', 'INT DEFAULT 0'], ['jss2_f', 'INT DEFAULT 0'],
      ['jss3_m', 'INT DEFAULT 0'], ['jss3_f', 'INT DEFAULT 0'],
      ['ss1_m', 'INT DEFAULT 0'],  ['ss1_f', 'INT DEFAULT 0'],
      ['ss2_m', 'INT DEFAULT 0'],  ['ss2_f', 'INT DEFAULT 0'],
      ['ss3_m', 'INT DEFAULT 0'],  ['ss3_f', 'INT DEFAULT 0'],
      ['reg_cac', 'BOOLEAN DEFAULT false'],
      ['reg_state', 'BOOLEAN DEFAULT false'],
      ['reg_napps', 'BOOLEAN DEFAULT false'],
      ['payment_status', "VARCHAR(20) DEFAULT 'unpaid'"],
    ];

    for (const [col, type] of newColumns) {
      await client.query(`
        ALTER TABLE membership_forms ADD COLUMN IF NOT EXISTS ${col} ${type};
      `).catch(() => {}); // ignore if already exists
    }

    // Make old columns nullable (from previous schema)
    const oldNullableCols = ['full_name', 'phone', 'date_of_birth', 'gender', 'occupation',
      'residential_address', 'state_of_origin', 'membership_track', 'next_of_kin_name',
      'next_of_kin_phone', 'next_of_kin_relationship', 'passport_photo_url', 'means_of_id'];
    for (const col of oldNullableCols) {
      await client.query(`ALTER TABLE membership_forms ALTER COLUMN ${col} DROP NOT NULL`).catch(() => {});
    }

    // Drop foreign key constraint on payment_reference if it exists
    await client.query(`
      DO $$
      DECLARE
        r RECORD;
      BEGIN
        FOR r IN (
          SELECT constraint_name 
          FROM information_schema.table_constraints 
          WHERE table_name = 'membership_forms' 
          AND constraint_type = 'FOREIGN KEY'
        ) LOOP
          EXECUTE 'ALTER TABLE membership_forms DROP CONSTRAINT IF EXISTS ' || r.constraint_name;
        END LOOP;
      END $$;
    `).catch(() => {});

    console.log('✅ Database tables initialized');
  } finally {
    client.release();
  }
};

module.exports = { pool, initDB };

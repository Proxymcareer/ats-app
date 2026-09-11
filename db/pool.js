const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env for local dev, ' +
      'or set it in your hosting provider (Render sets it automatically ' +
      'when a database is attached via render.yaml).'
  );
}

const useSsl = String(process.env.PGSSL || '').toLowerCase() === 'true';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

module.exports = pool;

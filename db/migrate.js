// Applies schema.sql (idempotent) and seeds/updates the single admin
// account from ADMIN_EMAIL / ADMIN_PASSWORD. Safe to run on every deploy.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('./pool');

async function main() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const client = await pool.connect();
  try {
    console.log('Applying schema...');
    await client.query(schema);

    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (email && password) {
      const hash = await bcrypt.hash(password, 10);
      await client.query(
        `INSERT INTO admins (email, password_hash)
         VALUES ($1, $2)
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
        [email.toLowerCase().trim(), hash]
      );
      console.log(`Admin account ready for ${email}`);
    } else {
      console.warn(
        'ADMIN_EMAIL / ADMIN_PASSWORD not set -- no admin account seeded. ' +
          'Set them and re-run "npm run migrate" (or redeploy) before trying to log in.'
      );
    }
    console.log('Migration complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

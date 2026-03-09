const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: '.env.local' });

function getConfig() {
  const required = ['DB_HOST', 'DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD', 'ADMIN_LOGIN', 'ADMIN_PASSWORD'];
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing ${key}`);
    }
  }

  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || '3306'),
    database: process.env.DB_DATABASE,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    connectTimeout: 15000
  };
}

async function run() {
  const config = getConfig();
  const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
  const conn = await mysql.createConnection(config);

  try {
    await conn.execute(
      `
      INSERT INTO users (id, role, login, password_hash, is_active)
      VALUES (UUID(), 'admin', ?, ?, 1)
      ON DUPLICATE KEY UPDATE
        role = 'admin',
        password_hash = VALUES(password_hash),
        is_active = 1,
        updated_at = CURRENT_TIMESTAMP
      `,
      [process.env.ADMIN_LOGIN, passwordHash]
    );

    console.log(`admin user upserted: ${process.env.ADMIN_LOGIN}`);
  } finally {
    await conn.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

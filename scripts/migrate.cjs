const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env.local' });

function getConfig() {
  const required = ['DB_HOST', 'DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD'];
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
    connectTimeout: 15000,
    multipleStatements: true
  };
}

async function run() {
  const conn = await mysql.createConnection(getConfig());

  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    const migrationsDir = path.join(process.cwd(), 'db', 'migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.mysql.sql'))
      .sort();

    for (const file of files) {
      const [existing] = await conn.execute('SELECT 1 FROM schema_migrations WHERE filename = ? LIMIT 1', [file]);
      if (existing.length > 0) {
        console.log(`skip ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`apply ${file}`);
      await conn.beginTransaction();
      await conn.query(sql);
      await conn.execute('INSERT INTO schema_migrations(filename) VALUES (?)', [file]);
      await conn.commit();
    }

    console.log('migrations complete');
  } catch (error) {
    await conn.rollback().catch(() => undefined);
    throw error;
  } finally {
    await conn.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

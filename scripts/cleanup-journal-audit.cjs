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
    connectTimeout: 15000
  };
}

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run')
  };
}

async function run() {
  const { dryRun } = parseArgs();
  const conn = await mysql.createConnection(getConfig());

  try {
    const [countRows] = await conn.query(`
      SELECT COUNT(*) AS total
      FROM audit_logs
      WHERE entity_type IN ('lesson_slot', 'journal_weekly_template')
        AND created_at < (UTC_TIMESTAMP() - INTERVAL 12 MONTH)
    `);

    const total = Number(countRows[0]?.total ?? 0);
    console.log(`[cleanup-journal-audit] candidates: ${total}`);

    if (dryRun || total === 0) {
      console.log(`[cleanup-journal-audit] mode: ${dryRun ? 'dry-run' : 'no-op'}`);
      return;
    }

    const [result] = await conn.query(`
      DELETE FROM audit_logs
      WHERE entity_type IN ('lesson_slot', 'journal_weekly_template')
        AND created_at < (UTC_TIMESTAMP() - INTERVAL 12 MONTH)
    `);

    console.log(`[cleanup-journal-audit] deleted: ${Number(result.affectedRows ?? 0)}`);
  } finally {
    await conn.end();
  }
}

run().catch((error) => {
  console.error('[cleanup-journal-audit] failed', error);
  process.exit(1);
});

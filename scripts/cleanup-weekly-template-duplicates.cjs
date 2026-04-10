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

function parseArgs(argv) {
  const args = {
    apply: false,
    limit: 5000,
    teacherId: null,
    fromDate: null,
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') {
      args.apply = true;
      continue;
    }
    if (arg === '--limit') {
      const value = Number(argv[i + 1]);
      if (!Number.isInteger(value) || value < 1) throw new Error('INVALID_LIMIT');
      args.limit = value;
      i += 1;
      continue;
    }
    if (arg === '--teacher-id') {
      const value = (argv[i + 1] || '').trim();
      if (!value) throw new Error('INVALID_TEACHER_ID');
      args.teacherId = value;
      i += 1;
      continue;
    }
    if (arg === '--from-date') {
      const value = (argv[i + 1] || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('INVALID_FROM_DATE');
      args.fromDate = value;
      i += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    throw new Error(`UNKNOWN_ARG:${arg}`);
  }

  return args;
}

function printHelp() {
  console.log('Usage:');
  console.log('  npm run journal:cleanup:template-duplicates -- [--apply] [--limit 5000] [--teacher-id <uuid>] [--from-date YYYY-MM-DD]');
  console.log('');
  console.log('Behavior:');
  console.log('  - Looks only at lesson_slots with source_weekly_slot_id IS NOT NULL');
  console.log("  - Looks only at statuses: planned, overdue");
  console.log('  - In duplicate groups (teacher_id + date + source_weekly_slot_id), keeps the newest slot');
  console.log('  - Deletes older duplicates');
  console.log('  - Recalculates next_lesson_at/last_lesson_at for affected students');
  console.log('');
  console.log('Examples:');
  console.log('  npm run journal:cleanup:template-duplicates');
  console.log('  npm run journal:cleanup:template-duplicates -- --apply');
  console.log('  npm run journal:cleanup:template-duplicates -- --teacher-id <uuid> --apply');
}

function buildBaseWhere(args) {
  const where = [
    "source_weekly_slot_id IS NOT NULL",
    "status IN ('planned', 'overdue')"
  ];
  const params = [];

  if (args.teacherId) {
    where.push('teacher_id = ?');
    params.push(args.teacherId);
  }
  if (args.fromDate) {
    where.push('date >= ?');
    params.push(args.fromDate);
  }

  return { whereSql: where.join(' AND '), params };
}

function buildDuplicateRowsQuery(whereSql) {
  return `
    SELECT
      id,
      teacher_id,
      student_id,
      source_weekly_slot_id,
      DATE_FORMAT(date, '%Y-%m-%d') AS date,
      TIME_FORMAT(start_time, '%H:%i') AS start_time,
      status,
      created_at,
      updated_at
    FROM (
      SELECT
        ls.*,
        ROW_NUMBER() OVER (
          PARTITION BY ls.teacher_id, ls.date, ls.source_weekly_slot_id
          ORDER BY ls.updated_at DESC, ls.created_at DESC, ls.start_time DESC, ls.id DESC
        ) AS row_num,
        COUNT(*) OVER (
          PARTITION BY ls.teacher_id, ls.date, ls.source_weekly_slot_id
        ) AS grp_count
      FROM lesson_slots ls
      WHERE ${whereSql}
    ) ranked
    WHERE grp_count > 1 AND row_num > 1
    ORDER BY teacher_id, date, source_weekly_slot_id, start_time, id
    LIMIT ?
  `;
}

function formatTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

async function syncStudentTimeline(conn, studentIds) {
  if (studentIds.length === 0) return;

  const placeholders = studentIds.map(() => '?').join(', ');
  await conn.query(
    `
      UPDATE students s
      LEFT JOIN (
        SELECT
          student_id,
          DATE_FORMAT(
            MIN(CASE WHEN status IN ('planned', 'overdue') THEN TIMESTAMP(date, start_time) END),
            '%Y-%m-%d %H:%i:%s'
          ) AS next_lesson_at,
          DATE_FORMAT(
            MAX(CASE WHEN status = 'completed' THEN TIMESTAMP(date, start_time) END),
            '%Y-%m-%d %H:%i:%s'
          ) AS last_lesson_at
        FROM lesson_slots
        WHERE student_id IN (${placeholders})
        GROUP BY student_id
      ) stats ON stats.student_id = s.id
      SET
        s.next_lesson_at = stats.next_lesson_at,
        s.last_lesson_at = stats.last_lesson_at
      WHERE s.id IN (${placeholders})
    `,
    [...studentIds, ...studentIds]
  );
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const conn = await mysql.createConnection(getConfig());
  try {
    const { whereSql, params } = buildBaseWhere(args);
    const duplicateRowsSql = buildDuplicateRowsQuery(whereSql);
    const [rows] = await conn.query(duplicateRowsSql, [...params, args.limit]);

    const duplicates = rows.map((row) => ({
      id: String(row.id),
      teacher_id: String(row.teacher_id),
      student_id: row.student_id ? String(row.student_id) : null,
      source_weekly_slot_id: String(row.source_weekly_slot_id),
      date: String(row.date),
      start_time: String(row.start_time),
      status: String(row.status),
      created_at: formatTimestamp(row.created_at),
      updated_at: formatTimestamp(row.updated_at)
    }));

    console.log(`[weekly-template-duplicates] mode: ${args.apply ? 'APPLY' : 'DRY-RUN'}`);
    console.log(`[weekly-template-duplicates] scanned duplicates: ${duplicates.length}`);
    if (args.teacherId) console.log(`[weekly-template-duplicates] teacherId filter: ${args.teacherId}`);
    if (args.fromDate) console.log(`[weekly-template-duplicates] fromDate filter: ${args.fromDate}`);

    if (duplicates.length === 0) {
      console.log('[weekly-template-duplicates] no duplicate rows found');
      return;
    }

    console.table(
      duplicates.slice(0, 20).map((row) => ({
        id: row.id,
        teacher_id: row.teacher_id,
        date: row.date,
        source_weekly_slot_id: row.source_weekly_slot_id,
        start_time: row.start_time,
        status: row.status
      }))
    );
    if (duplicates.length > 20) {
      console.log(`[weekly-template-duplicates] preview limited to 20 rows of ${duplicates.length}`);
    }

    if (!args.apply) return;

    const deleteIds = duplicates.map((row) => row.id);
    const affectedStudentIds = Array.from(new Set(duplicates.map((row) => row.student_id).filter(Boolean)));

    await conn.beginTransaction();
    try {
      const deletePlaceholders = deleteIds.map(() => '?').join(', ');
      const [deleteResult] = await conn.query(
        `
          DELETE FROM lesson_slots
          WHERE id IN (${deletePlaceholders})
        `,
        deleteIds
      );

      await syncStudentTimeline(conn, affectedStudentIds);
      await conn.commit();

      console.log(`[weekly-template-duplicates] deleted rows: ${Number(deleteResult.affectedRows ?? 0)}`);
      console.log(`[weekly-template-duplicates] affected students synced: ${affectedStudentIds.length}`);
    } catch (error) {
      await conn.rollback();
      throw error;
    }
  } finally {
    await conn.end();
  }
}

run().catch((error) => {
  console.error('[weekly-template-duplicates] failed', error);
  process.exit(1);
});

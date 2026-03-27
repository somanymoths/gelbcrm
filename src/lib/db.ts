import mysql from 'mysql2/promise';
import { randomUUID } from 'crypto';
import { getMysqlPool } from '@/lib/mysql-pool';
import { deriveTelegramNormalized } from '@/lib/teachers';

function getPool(): mysql.Pool {
  return getMysqlPool();
}

const TRANSIENT_DB_ERROR_CODES = new Set([
  'ECONNRESET',
  'PROTOCOL_CONNECTION_LOST',
  'ETIMEDOUT',
  'EPIPE'
]);

function isTransientDbError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  const code = String((error as { code?: unknown }).code ?? '');
  return TRANSIENT_DB_ERROR_CODES.has(code);
}

async function queryWithTransientRetry<T extends mysql.QueryResult>(
  sql: string,
  params?: unknown[]
): Promise<[T, mysql.FieldPacket[]]> {
  try {
    return await getPool().query<T>(sql, params);
  } catch (error) {
    if (!isTransientDbError(error)) throw error;
    return getPool().query<T>(sql, params);
  }
}

let hasWeeklySlotStudentIdColumnCache: boolean | null = null;
let hasWeeklySlotStartFromColumnCache: boolean | null = null;

export type DbUser = {
  id: string;
  role: 'admin' | 'teacher';
  login: string;
  password_hash: string;
  is_active: 0 | 1;
};

export type FunnelStage = {
  id: number;
  code: string;
  name: string;
  sort_order: number;
};

export type StudentRow = {
  id: string;
  first_name: string;
  last_name: string;
  contact_link: string | null;
  phone: string | null;
  email: string | null;
  assigned_teacher_id: string | null;
  current_funnel_stage_id: number;
  stage_code: string;
  stage_name: string;
  created_at: string;
  updated_at: string;
};

export async function findActiveUserByLogin(login: string): Promise<DbUser | null> {
  const [rows] = await queryWithTransientRetry<mysql.RowDataPacket[]>(
    `
      SELECT id, role, login, password_hash, is_active
      FROM users
      WHERE login = ?
      LIMIT 1
    `,
    [login]
  );

  if (rows.length === 0) return null;

  const user = rows[0] as DbUser;
  if (!user.is_active) return null;
  return user;
}

export async function findUserById(id: string): Promise<Pick<DbUser, 'id' | 'role' | 'login'> | null> {
  const [rows] = await queryWithTransientRetry<mysql.RowDataPacket[]>(
    `
      SELECT id, role, login
      FROM users
      WHERE id = ? AND is_active = 1
      LIMIT 1
    `,
    [id]
  );

  if (rows.length === 0) return null;
  const user = rows[0] as Pick<DbUser, 'id' | 'role' | 'login'>;
  return user;
}

export async function listFunnelStages(): Promise<FunnelStage[]> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT id, code, name, sort_order
      FROM funnel_stages
      ORDER BY sort_order ASC
    `
  );

  return rows as FunnelStage[];
}

export async function listStudents(): Promise<StudentRow[]> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT
        s.id,
        s.first_name,
        s.last_name,
        s.contact_link,
        s.phone,
        s.email,
        s.assigned_teacher_id,
        s.current_funnel_stage_id,
        fs.code AS stage_code,
        fs.name AS stage_name,
        s.created_at,
        s.updated_at
      FROM students s
      INNER JOIN funnel_stages fs ON fs.id = s.current_funnel_stage_id
      ORDER BY s.created_at DESC
    `
  );

  return rows as StudentRow[];
}

export async function createStudent(input: {
  firstName: string;
  lastName: string;
  contactLink?: string | null;
  phone?: string | null;
  email?: string | null;
  actorUserId: string;
}): Promise<StudentRow> {
  const pool = getPool();
  const connection = await pool.getConnection();
  const studentId = randomUUID();

  try {
    await connection.beginTransaction();

    const [stageRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT id FROM funnel_stages WHERE code = 'interested' LIMIT 1`
    );

    if (stageRows.length === 0) {
      throw new Error('FUNNEL_STAGE_NOT_FOUND');
    }

    const stageId = Number(stageRows[0].id);

    await connection.query(
      `
      INSERT INTO students (
        id,
        first_name,
        last_name,
        contact_link,
        phone,
        email,
        current_funnel_stage_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        studentId,
        input.firstName,
        input.lastName,
        input.contactLink ?? null,
        input.phone ?? null,
        input.email ?? null,
        stageId
      ]
    );

    const [createdRows] = await connection.query<mysql.RowDataPacket[]>(
      `
      SELECT
        s.id,
        s.first_name,
        s.last_name,
        s.contact_link,
        s.phone,
        s.email,
        s.assigned_teacher_id,
        s.current_funnel_stage_id,
        fs.code AS stage_code,
        fs.name AS stage_name,
        s.created_at,
        s.updated_at
      FROM students s
      INNER JOIN funnel_stages fs ON fs.id = s.current_funnel_stage_id
      WHERE s.id = ?
      LIMIT 1
      `
      ,
      [studentId]
    );

    const created = createdRows[0] as StudentRow;

    await writeAuditLog(connection, {
      actorUserId: input.actorUserId,
      entityType: 'student',
      entityId: created.id,
      action: 'create',
      diffAfter: {
        first_name: created.first_name,
        last_name: created.last_name,
        phone: created.phone,
        email: created.email,
        stage_code: created.stage_code
      }
    });

    await connection.query(
      `
      INSERT INTO funnel_stage_history (student_id, old_stage_id, new_stage_id, changed_by)
      VALUES (?, NULL, ?, ?)
      `,
      [created.id, stageId, input.actorUserId]
    );

    await connection.commit();
    return created;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateStudentStage(input: {
  studentId: string;
  stageCode: string;
  actorUserId: string;
}): Promise<void> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [studentRows] = await connection.query<mysql.RowDataPacket[]>(
      `
      SELECT s.id, s.current_funnel_stage_id, fs.code AS current_stage_code
      FROM students s
      INNER JOIN funnel_stages fs ON fs.id = s.current_funnel_stage_id
      WHERE s.id = ?
      LIMIT 1
      `,
      [input.studentId]
    );

    if (studentRows.length === 0) {
      throw new Error('STUDENT_NOT_FOUND');
    }

    const student = studentRows[0] as {
      id: string;
      current_funnel_stage_id: number;
      current_stage_code: string;
    };

    const [stageRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT id, code FROM funnel_stages WHERE code = ? LIMIT 1`,
      [input.stageCode]
    );

    if (stageRows.length === 0) {
      throw new Error('FUNNEL_STAGE_NOT_FOUND');
    }

    const nextStageId = Number(stageRows[0].id);

    if (student.current_funnel_stage_id === nextStageId) {
      await connection.rollback();
      return;
    }

    await connection.query(
      `UPDATE students SET current_funnel_stage_id = ? WHERE id = ?`,
      [nextStageId, input.studentId]
    );

    await connection.query(
      `
      INSERT INTO funnel_stage_history (student_id, old_stage_id, new_stage_id, changed_by)
      VALUES (?, ?, ?, ?)
      `,
      [input.studentId, student.current_funnel_stage_id, nextStageId, input.actorUserId]
    );

    await writeAuditLog(connection, {
      actorUserId: input.actorUserId,
      entityType: 'student',
      entityId: input.studentId,
      action: 'update_stage',
      diffBefore: { stage_code: student.current_stage_code },
      diffAfter: { stage_code: input.stageCode }
    });

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function assignTeacher(input: {
  studentId: string;
  teacherId: string;
  actorUserId: string;
}): Promise<void> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [studentRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT id, assigned_teacher_id FROM students WHERE id = ? LIMIT 1`,
      [input.studentId]
    );

    if (studentRows.length === 0) {
      throw new Error('STUDENT_NOT_FOUND');
    }

    const student = studentRows[0] as { id: string; assigned_teacher_id: string | null };

    const [teacherRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT id FROM teachers WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [input.teacherId]
    );

    if (teacherRows.length === 0) {
      throw new Error('TEACHER_NOT_FOUND');
    }

    if (student.assigned_teacher_id === input.teacherId) {
      await connection.rollback();
      return;
    }

    await connection.query(
      `UPDATE students SET assigned_teacher_id = ? WHERE id = ?`,
      [input.teacherId, input.studentId]
    );

    await connection.query(
      `
      INSERT INTO student_teacher_history (student_id, old_teacher_id, new_teacher_id, changed_by)
      VALUES (?, ?, ?, ?)
      `,
      [input.studentId, student.assigned_teacher_id, input.teacherId, input.actorUserId]
    );

    await writeAuditLog(connection, {
      actorUserId: input.actorUserId,
      entityType: 'student',
      entityId: input.studentId,
      action: 'assign_teacher',
      diffBefore: { assigned_teacher_id: student.assigned_teacher_id },
      diffAfter: { assigned_teacher_id: input.teacherId }
    });

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

type AuditInput = {
  actorUserId: string;
  entityType: string;
  entityId: string;
  action: string;
  diffBefore?: Record<string, unknown>;
  diffAfter?: Record<string, unknown>;
};

async function writeAuditLog(connection: mysql.PoolConnection, input: AuditInput): Promise<void> {
  await connection.query(
    `
    INSERT INTO audit_logs (actor_user_id, entity_type, entity_id, action, diff_before, diff_after)
    VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      input.actorUserId,
      input.entityType,
      input.entityId,
      input.action,
      input.diffBefore ? JSON.stringify(input.diffBefore) : null,
      input.diffAfter ? JSON.stringify(input.diffAfter) : null
    ]
  );
}

export type SchoolLanguageRow = {
  id: number;
  name: string;
  flag_emoji: string | null;
};

export type TeacherListScope = 'active' | 'archived';
export type TeacherSortBy = 'name' | 'students' | 'rate' | 'createdAt';
export type TeacherSortDir = 'asc' | 'desc';

export type TeacherListItem = {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  language_id: number | null;
  language_name: string | null;
  language_flag_emoji: string | null;
  rate_rub: number | null;
  telegram_raw: string | null;
  telegram_display: string | null;
  phone: string | null;
  comment: string | null;
  active_students_count: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type TeacherStudentName = {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
};

export type TeacherDetails = TeacherListItem & {
  students: TeacherStudentName[];
};

export async function listSchoolLanguages(): Promise<SchoolLanguageRow[]> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT id, name, flag_emoji
      FROM school_languages
      ORDER BY name ASC
    `
  );

  return rows as SchoolLanguageRow[];
}

export async function createSchoolLanguage(input: { name: string; flagEmoji?: string | null }): Promise<SchoolLanguageRow> {
  const [result] = await getPool().query<mysql.ResultSetHeader>(
    `
      INSERT INTO school_languages (name, flag_emoji)
      VALUES (?, ?)
    `,
    [input.name, input.flagEmoji ?? null]
  );

  return { id: result.insertId, name: input.name, flag_emoji: input.flagEmoji ?? null };
}

export async function deleteSchoolLanguage(input: { id: number }): Promise<void> {
  const [inUse] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT 1
      FROM teachers
      WHERE language_id = ?
      LIMIT 1
    `,
    [input.id]
  );

  if (inUse.length > 0) {
    throw new Error('LANGUAGE_IN_USE');
  }

  const [result] = await getPool().query<mysql.ResultSetHeader>(
    `DELETE FROM school_languages WHERE id = ?`,
    [input.id]
  );

  if (result.affectedRows === 0) {
    throw new Error('LANGUAGE_NOT_FOUND');
  }
}

export async function listTeachers(input: {
  offset: number;
  limit: number;
  scope: TeacherListScope;
  search?: string | null;
  languageId?: number | null;
  sortBy?: TeacherSortBy;
  sortDir?: TeacherSortDir;
}): Promise<{ items: TeacherListItem[]; total: number; nextOffset: number | null }> {
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (input.scope === 'archived') {
    clauses.push('t.deleted_at IS NOT NULL');
  } else {
    clauses.push('t.deleted_at IS NULL');
  }

  if (input.search) {
    clauses.push('(t.first_name LIKE ? OR t.last_name LIKE ?)');
    const pattern = `%${escapeLike(input.search)}%`;
    params.push(pattern, pattern);
  }

  if (typeof input.languageId === 'number') {
    clauses.push('t.language_id = ?');
    params.push(input.languageId);
  }

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const sortBy = input.sortBy ?? 'createdAt';
  const sortDir = input.sortDir === 'asc' ? 'ASC' : 'DESC';

  let orderClause = 'ORDER BY t.created_at DESC, t.id DESC';
  if (sortBy === 'name') {
    orderClause = `ORDER BY t.first_name ${sortDir}, t.last_name ${sortDir}, t.id DESC`;
  } else if (sortBy === 'students') {
    orderClause = `ORDER BY active_students_count ${sortDir}, t.id DESC`;
  } else if (sortBy === 'rate') {
    orderClause = `ORDER BY (t.rate_rub IS NULL) ASC, t.rate_rub ${sortDir}, t.id DESC`;
  } else if (sortBy === 'createdAt') {
    orderClause = `ORDER BY t.created_at ${sortDir}, t.id DESC`;
  }

  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT
        t.id,
        t.first_name,
        t.last_name,
        CONCAT_WS(' ', t.first_name, t.last_name) AS full_name,
        t.language_id,
        sl.name AS language_name,
        sl.flag_emoji AS language_flag_emoji,
        t.rate_rub,
        t.telegram_raw,
        t.telegram_normalized,
        t.phone,
        t.comment,
        t.created_at,
        t.updated_at,
        t.deleted_at,
        (
          SELECT COUNT(*)
          FROM students s
          WHERE s.assigned_teacher_id = t.id
        ) AS active_students_count
      FROM teachers t
      LEFT JOIN school_languages sl ON sl.id = t.language_id
      ${whereClause}
      ${orderClause}
      LIMIT ? OFFSET ?
    `,
    [...params, input.limit, input.offset]
  );

  const [countRows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT COUNT(*) AS total
      FROM teachers t
      ${whereClause}
    `,
    params
  );

  const total = Number(countRows[0]?.total ?? 0);

  const items: TeacherListItem[] = rows.map((row) => {
    const normalized = typeof row.telegram_normalized === 'string' ? row.telegram_normalized : null;
    return {
      id: String(row.id),
      first_name: String(row.first_name),
      last_name: String(row.last_name),
      full_name: String(row.full_name),
      language_id: row.language_id === null ? null : Number(row.language_id),
      language_name: row.language_name ? String(row.language_name) : null,
      language_flag_emoji: row.language_flag_emoji ? String(row.language_flag_emoji) : null,
      rate_rub: row.rate_rub === null ? null : Number(row.rate_rub),
      telegram_raw: row.telegram_raw ? String(row.telegram_raw) : null,
      telegram_display: normalized ? `@${normalized}` : null,
      phone: row.phone ? String(row.phone) : null,
      comment: row.comment ? String(row.comment) : null,
      active_students_count: Number(row.active_students_count ?? 0),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      deleted_at: row.deleted_at ? String(row.deleted_at) : null
    };
  });

  const nextOffset = input.offset + items.length < total ? input.offset + items.length : null;

  return { items, total, nextOffset };
}

export async function getTeacherById(input: { id: string }): Promise<TeacherDetails | null> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT
        t.id,
        t.first_name,
        t.last_name,
        CONCAT_WS(' ', t.first_name, t.last_name) AS full_name,
        t.language_id,
        sl.name AS language_name,
        sl.flag_emoji AS language_flag_emoji,
        t.rate_rub,
        t.telegram_raw,
        t.telegram_normalized,
        t.phone,
        t.comment,
        t.created_at,
        t.updated_at,
        t.deleted_at,
        (
          SELECT COUNT(*)
          FROM students s
          WHERE s.assigned_teacher_id = t.id
        ) AS active_students_count
      FROM teachers t
      LEFT JOIN school_languages sl ON sl.id = t.language_id
      WHERE t.id = ?
      LIMIT 1
    `,
    [input.id]
  );

  if (rows.length === 0) return null;

  const row = rows[0];

  const [studentsRows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT id, first_name, last_name, CONCAT_WS(' ', first_name, last_name) AS full_name
      FROM students
      WHERE assigned_teacher_id = ?
      ORDER BY first_name ASC, last_name ASC
    `,
    [input.id]
  );

  const students: TeacherStudentName[] = studentsRows.map((studentRow) => ({
    id: String(studentRow.id),
    first_name: String(studentRow.first_name),
    last_name: String(studentRow.last_name),
    full_name: String(studentRow.full_name)
  }));

  const normalized = typeof row.telegram_normalized === 'string' ? row.telegram_normalized : null;

  return {
    id: String(row.id),
    first_name: String(row.first_name),
    last_name: String(row.last_name),
    full_name: String(row.full_name),
    language_id: row.language_id === null ? null : Number(row.language_id),
    language_name: row.language_name ? String(row.language_name) : null,
    language_flag_emoji: row.language_flag_emoji ? String(row.language_flag_emoji) : null,
    rate_rub: row.rate_rub === null ? null : Number(row.rate_rub),
    telegram_raw: row.telegram_raw ? String(row.telegram_raw) : null,
    telegram_display: normalized ? `@${normalized}` : null,
    phone: row.phone ? String(row.phone) : null,
    comment: row.comment ? String(row.comment) : null,
    active_students_count: Number(row.active_students_count ?? 0),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    deleted_at: row.deleted_at ? String(row.deleted_at) : null,
    students
  };
}

export async function createTeacher(input: {
  firstName: string;
  lastName: string;
  languageId?: number | null;
  rateRub?: number | null;
  telegramRaw?: string | null;
  phone?: string | null;
  comment?: string | null;
  actorUserId: string;
}): Promise<TeacherDetails> {
  const id = randomUUID();
  const telegramNormalized = deriveTelegramNormalized(input.telegramRaw);

  await getPool().query(
    `
      INSERT INTO teachers (
        id,
        full_name,
        first_name,
        last_name,
        language_id,
        rate_rub,
        telegram_raw,
        telegram_normalized,
        phone,
        comment
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      `${input.firstName} ${input.lastName}`.trim(),
      input.firstName,
      input.lastName,
      input.languageId ?? null,
      input.rateRub ?? null,
      input.telegramRaw ?? null,
      telegramNormalized,
      input.phone ?? null,
      input.comment ?? null
    ]
  );

  const created = await getTeacherById({ id });
  if (!created) {
    throw new Error('TEACHER_NOT_FOUND');
  }

  const connection = await getPool().getConnection();
  try {
    await writeAuditLog(connection, {
      actorUserId: input.actorUserId,
      entityType: 'teacher',
      entityId: id,
      action: 'create',
      diffAfter: {
        first_name: input.firstName,
        last_name: input.lastName
      }
    });
  } finally {
    connection.release();
  }

  return created;
}

export async function updateTeacher(input: {
  id: string;
  firstName: string;
  lastName: string;
  languageId?: number | null;
  rateRub?: number | null;
  telegramRaw?: string | null;
  phone?: string | null;
  comment?: string | null;
  actorUserId: string;
}): Promise<TeacherDetails> {
  const telegramNormalized = deriveTelegramNormalized(input.telegramRaw);

  const [result] = await getPool().query<mysql.ResultSetHeader>(
    `
      UPDATE teachers
      SET
        full_name = ?,
        first_name = ?,
        last_name = ?,
        language_id = ?,
        rate_rub = ?,
        telegram_raw = ?,
        telegram_normalized = ?,
        phone = ?,
        comment = ?
      WHERE id = ?
    `,
    [
      `${input.firstName} ${input.lastName}`.trim(),
      input.firstName,
      input.lastName,
      input.languageId ?? null,
      input.rateRub ?? null,
      input.telegramRaw ?? null,
      telegramNormalized,
      input.phone ?? null,
      input.comment ?? null,
      input.id
    ]
  );

  if (result.affectedRows === 0) {
    throw new Error('TEACHER_NOT_FOUND');
  }

  const updated = await getTeacherById({ id: input.id });
  if (!updated) {
    throw new Error('TEACHER_NOT_FOUND');
  }

  const connection = await getPool().getConnection();
  try {
    await writeAuditLog(connection, {
      actorUserId: input.actorUserId,
      entityType: 'teacher',
      entityId: input.id,
      action: 'update'
    });
  } finally {
    connection.release();
  }

  return updated;
}

export async function archiveTeacher(input: { id: string }): Promise<void> {
  const [result] = await getPool().query<mysql.ResultSetHeader>(
    `
      UPDATE teachers
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = ? AND deleted_at IS NULL
    `,
    [input.id]
  );

  if (result.affectedRows === 0) {
    throw new Error('TEACHER_NOT_FOUND');
  }
}

export async function restoreTeacher(input: { id: string }): Promise<void> {
  const [result] = await getPool().query<mysql.ResultSetHeader>(
    `
      UPDATE teachers
      SET deleted_at = NULL
      WHERE id = ? AND deleted_at IS NOT NULL
    `,
    [input.id]
  );

  if (result.affectedRows === 0) {
    throw new Error('TEACHER_NOT_FOUND');
  }
}

export async function listTeacherDependencies(input: { id: string }): Promise<TeacherStudentName[]> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT id, first_name, last_name, CONCAT_WS(' ', first_name, last_name) AS full_name
      FROM students
      WHERE assigned_teacher_id = ?
      ORDER BY first_name ASC, last_name ASC
    `,
    [input.id]
  );

  return rows.map((row) => ({
    id: String(row.id),
    first_name: String(row.first_name),
    last_name: String(row.last_name),
    full_name: String(row.full_name)
  }));
}

export async function unbindStudentsFromTeacher(input: {
  teacherId: string;
  studentIds: string[];
  actorUserId: string;
}): Promise<number> {
  if (input.studentIds.length === 0) return 0;

  const placeholders = input.studentIds.map(() => '?').join(', ');
  const [result] = await getPool().query<mysql.ResultSetHeader>(
    `
      UPDATE students
      SET assigned_teacher_id = NULL
      WHERE assigned_teacher_id = ?
        AND id IN (${placeholders})
    `,
    [input.teacherId, ...input.studentIds]
  );

  if (result.affectedRows > 0) {
    const connection = await getPool().getConnection();
    try {
      await writeAuditLog(connection, {
        actorUserId: input.actorUserId,
        entityType: 'teacher',
        entityId: input.teacherId,
        action: 'unbind_students',
        diffAfter: { affected_rows: result.affectedRows }
      });
    } finally {
      connection.release();
    }
  }

  return result.affectedRows;
}

export async function unbindAllStudentsAndDeleteTeacher(input: {
  teacherId: string;
  actorUserId: string;
}): Promise<void> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query(
      `
        UPDATE students
        SET assigned_teacher_id = NULL
        WHERE assigned_teacher_id = ?
      `,
      [input.teacherId]
    );

    const [leftRows] = await connection.query<mysql.RowDataPacket[]>(
      `
        SELECT id
        FROM students
        WHERE assigned_teacher_id = ?
        LIMIT 1
      `,
      [input.teacherId]
    );

    if (leftRows.length > 0) {
      throw new Error('DEPENDENCIES_REMAIN');
    }

    const [deleteResult] = await connection.query<mysql.ResultSetHeader>(
      `DELETE FROM teachers WHERE id = ?`,
      [input.teacherId]
    );

    if (deleteResult.affectedRows === 0) {
      throw new Error('TEACHER_NOT_FOUND');
    }

    await writeAuditLog(connection, {
      actorUserId: input.actorUserId,
      entityType: 'teacher',
      entityId: input.teacherId,
      action: 'delete'
    });

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function deleteTeacherPermanently(input: { id: string }): Promise<void> {
  const dependencies = await listTeacherDependencies({ id: input.id });
  if (dependencies.length > 0) {
    throw new Error('TEACHER_HAS_DEPENDENCIES');
  }

  const [result] = await getPool().query<mysql.ResultSetHeader>(
    `DELETE FROM teachers WHERE id = ?`,
    [input.id]
  );

  if (result.affectedRows === 0) {
    throw new Error('TEACHER_NOT_FOUND');
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

export type PaymentHistoryRow = {
  id: number;
  provider_payment_id: string;
  status: string;
  amount: number;
  currency: string;
  payer_name: string | null;
  payer_email: string | null;
  tariff_name: string | null;
  lessons_count: number | null;
  created_at: string;
  paid_at: string | null;
};

export async function upsertYookassaPayment(input: {
  providerPaymentId: string;
  status: string;
  amount: number;
  currency: string;
  payerName?: string | null;
  payerEmail?: string | null;
  tariffName?: string | null;
  lessonsCount?: number | null;
  metadata?: Record<string, string> | null;
  rawPayload?: Record<string, unknown> | null;
  paidAt?: string | null;
}): Promise<void> {
  await getPool().query(
    `
    INSERT INTO yookassa_payments (
      provider_payment_id,
      status,
      amount,
      currency,
      payer_name,
      payer_email,
      tariff_name,
      lessons_count,
      metadata,
      raw_payload,
      paid_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      status = VALUES(status),
      amount = VALUES(amount),
      currency = VALUES(currency),
      payer_name = COALESCE(VALUES(payer_name), payer_name),
      payer_email = COALESCE(VALUES(payer_email), payer_email),
      tariff_name = COALESCE(VALUES(tariff_name), tariff_name),
      lessons_count = COALESCE(VALUES(lessons_count), lessons_count),
      metadata = COALESCE(VALUES(metadata), metadata),
      raw_payload = COALESCE(VALUES(raw_payload), raw_payload),
      paid_at = COALESCE(VALUES(paid_at), paid_at)
    `,
    [
      input.providerPaymentId,
      input.status,
      input.amount,
      input.currency,
      input.payerName ?? null,
      input.payerEmail ?? null,
      input.tariffName ?? null,
      input.lessonsCount ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.rawPayload ? JSON.stringify(input.rawPayload) : null,
      input.paidAt ?? null
    ]
  );
}

export async function listPaymentHistory(limit = 200): Promise<PaymentHistoryRow[]> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
    SELECT
      id,
      provider_payment_id,
      status,
      amount,
      currency,
      payer_name,
      payer_email,
      tariff_name,
      lessons_count,
      created_at,
      paid_at
    FROM yookassa_payments
    ORDER BY created_at DESC
    LIMIT ?
    `,
    [limit]
  );

  return rows as PaymentHistoryRow[];
}

export type TariffGridListItem = {
  id: string;
  name: string;
  is_active: 0 | 1;
  created_at: string;
  updated_at: string;
};

export type TariffPackageItem = {
  id: string;
  tariff_grid_id: string;
  lessons_count: number;
  price_per_lesson_rub: number;
  total_price_rub: number;
  is_active: 0 | 1;
  created_at: string;
  updated_at: string;
};

export type TariffGridWithPackages = TariffGridListItem & {
  packages: TariffPackageItem[];
};

export async function listTariffGrids(input?: { includeInactive?: boolean }): Promise<TariffGridWithPackages[]> {
  const includeInactive = Boolean(input?.includeInactive);
  const [gridRows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT id, name, is_active, created_at, updated_at
      FROM tariff_grids
      ${includeInactive ? '' : 'WHERE is_active = 1'}
      ORDER BY created_at DESC
    `
  );

  if (gridRows.length === 0) return [];

  const ids = gridRows.map((row) => String(row.id));
  const placeholders = ids.map(() => '?').join(', ');

  const [packageRows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT
        id,
        tariff_grid_id,
        lessons_count,
        price_per_lesson_rub,
        total_price_rub,
        is_active,
        created_at,
        updated_at
      FROM tariff_packages
      WHERE tariff_grid_id IN (${placeholders})
      ORDER BY lessons_count ASC, total_price_rub ASC
    `,
    ids
  );

  const packageMap = new Map<string, TariffPackageItem[]>();

  for (const row of packageRows) {
    const key = String(row.tariff_grid_id);
    const list = packageMap.get(key) ?? [];
    list.push({
      id: String(row.id),
      tariff_grid_id: String(row.tariff_grid_id),
      lessons_count: Number(row.lessons_count),
      price_per_lesson_rub: Number(row.price_per_lesson_rub),
      total_price_rub: Number(row.total_price_rub),
      is_active: Number(row.is_active) ? 1 : 0,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at)
    });
    packageMap.set(key, list);
  }

  return gridRows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    is_active: Number(row.is_active) ? 1 : 0,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    packages: packageMap.get(String(row.id)) ?? []
  }));
}

export async function createTariffGrid(input: {
  name: string;
  actorUserId: string;
  packages: Array<{ lessonsCount: number; pricePerLessonRub: number }>;
}): Promise<TariffGridWithPackages> {
  const connection = await getPool().getConnection();
  const gridId = randomUUID();

  try {
    await connection.beginTransaction();

    await connection.query(
      `
        INSERT INTO tariff_grids (id, name, is_active, created_by)
        VALUES (?, ?, 1, ?)
      `,
      [gridId, input.name, input.actorUserId]
    );

    for (const pkg of input.packages) {
      const price = Number(pkg.pricePerLessonRub);
      const lessons = Number(pkg.lessonsCount);
      const total = Number((price * lessons).toFixed(2));

      await connection.query(
        `
          INSERT INTO tariff_packages (
            id,
            tariff_grid_id,
            lessons_count,
            price_per_lesson_rub,
            total_price_rub,
            is_active
          )
          VALUES (?, ?, ?, ?, ?, 1)
        `,
        [randomUUID(), gridId, lessons, price, total]
      );
    }

    await writeAuditLog(connection, {
      actorUserId: input.actorUserId,
      entityType: 'tariff_grid',
      entityId: gridId,
      action: 'create',
      diffAfter: {
        name: input.name,
        packages_count: input.packages.length
      }
    });

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const created = await getTariffGridById({ id: gridId });
  if (!created) throw new Error('TARIFF_GRID_NOT_FOUND');
  return created;
}

export async function getTariffGridById(input: { id: string }): Promise<TariffGridWithPackages | null> {
  const [gridRows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT id, name, is_active, created_at, updated_at
      FROM tariff_grids
      WHERE id = ?
      LIMIT 1
    `,
    [input.id]
  );

  if (gridRows.length === 0) return null;

  const [packageRows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT
        id,
        tariff_grid_id,
        lessons_count,
        price_per_lesson_rub,
        total_price_rub,
        is_active,
        created_at,
        updated_at
      FROM tariff_packages
      WHERE tariff_grid_id = ?
      ORDER BY lessons_count ASC, total_price_rub ASC
    `,
    [input.id]
  );

  const packages: TariffPackageItem[] = packageRows.map((row) => ({
    id: String(row.id),
    tariff_grid_id: String(row.tariff_grid_id),
    lessons_count: Number(row.lessons_count),
    price_per_lesson_rub: Number(row.price_per_lesson_rub),
    total_price_rub: Number(row.total_price_rub),
    is_active: Number(row.is_active) ? 1 : 0,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  }));

  return {
    id: String(gridRows[0].id),
    name: String(gridRows[0].name),
    is_active: Number(gridRows[0].is_active) ? 1 : 0,
    created_at: String(gridRows[0].created_at),
    updated_at: String(gridRows[0].updated_at),
    packages
  };
}

export async function updateTariffGrid(input: {
  id: string;
  actorUserId: string;
  name?: string;
}): Promise<void> {
  const updates: string[] = [];
  const values: Array<string | number> = [];

  if (typeof input.name === 'string') {
    updates.push('name = ?');
    values.push(input.name);
  }

  if (updates.length === 0) return;

  const [result] = await getPool().query<mysql.ResultSetHeader>(
    `
      UPDATE tariff_grids
      SET ${updates.join(', ')}
      WHERE id = ?
    `,
    [...values, input.id]
  );

  if (result.affectedRows === 0) {
    throw new Error('TARIFF_GRID_NOT_FOUND');
  }
}

export async function deleteTariffGrid(input: { id: string; actorUserId: string }): Promise<void> {
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();

    const [gridRows] = await connection.query<mysql.RowDataPacket[]>(
      `
        SELECT id, name
        FROM tariff_grids
        WHERE id = ?
        LIMIT 1
      `,
      [input.id]
    );

    if (gridRows.length === 0) {
      throw new Error('TARIFF_GRID_NOT_FOUND');
    }

    const [inUseRows] = await connection.query<mysql.RowDataPacket[]>(
      `
        SELECT 1
        FROM student_payment_links
        WHERE tariff_grid_id = ?
        LIMIT 1
      `,
      [input.id]
    );

    if (inUseRows.length > 0) {
      throw new Error('TARIFF_GRID_IN_USE');
    }

    await connection.query(`DELETE FROM tariff_grids WHERE id = ?`, [input.id]);

    await writeAuditLog(connection, {
      actorUserId: input.actorUserId,
      entityType: 'tariff_grid',
      entityId: input.id,
      action: 'delete',
      diffBefore: {
        name: String(gridRows[0].name)
      }
    });

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function createTariffPackage(input: {
  tariffGridId: string;
  lessonsCount: number;
  pricePerLessonRub: number;
}): Promise<TariffPackageItem> {
  const [gridRows] = await getPool().query<mysql.RowDataPacket[]>(
    `SELECT id FROM tariff_grids WHERE id = ? LIMIT 1`,
    [input.tariffGridId]
  );

  if (gridRows.length === 0) {
    throw new Error('TARIFF_GRID_NOT_FOUND');
  }

  const id = randomUUID();
  const total = Number((input.lessonsCount * input.pricePerLessonRub).toFixed(2));

  await getPool().query(
    `
      INSERT INTO tariff_packages (
        id,
        tariff_grid_id,
        lessons_count,
        price_per_lesson_rub,
        total_price_rub,
        is_active
      )
      VALUES (?, ?, ?, ?, ?, 1)
    `,
    [id, input.tariffGridId, input.lessonsCount, input.pricePerLessonRub, total]
  );

  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT
        id,
        tariff_grid_id,
        lessons_count,
        price_per_lesson_rub,
        total_price_rub,
        is_active,
        created_at,
        updated_at
      FROM tariff_packages
      WHERE id = ?
      LIMIT 1
    `,
    [id]
  );

  return {
    id: String(rows[0].id),
    tariff_grid_id: String(rows[0].tariff_grid_id),
    lessons_count: Number(rows[0].lessons_count),
    price_per_lesson_rub: Number(rows[0].price_per_lesson_rub),
    total_price_rub: Number(rows[0].total_price_rub),
    is_active: Number(rows[0].is_active) ? 1 : 0,
    created_at: String(rows[0].created_at),
    updated_at: String(rows[0].updated_at)
  };
}

export async function updateTariffPackage(input: {
  id: string;
  lessonsCount?: number;
  pricePerLessonRub?: number;
}): Promise<void> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT lessons_count, price_per_lesson_rub
      FROM tariff_packages
      WHERE id = ?
      LIMIT 1
    `,
    [input.id]
  );

  if (rows.length === 0) {
    throw new Error('TARIFF_PACKAGE_NOT_FOUND');
  }

  const nextLessons = typeof input.lessonsCount === 'number' ? input.lessonsCount : Number(rows[0].lessons_count);
  const nextPrice =
    typeof input.pricePerLessonRub === 'number' ? input.pricePerLessonRub : Number(rows[0].price_per_lesson_rub);
  const nextTotal = Number((nextLessons * nextPrice).toFixed(2));

  const updates: string[] = [
    'lessons_count = ?',
    'price_per_lesson_rub = ?',
    'total_price_rub = ?'
  ];
  const values: Array<string | number> = [nextLessons, nextPrice, nextTotal];

  const [result] = await getPool().query<mysql.ResultSetHeader>(
    `
      UPDATE tariff_packages
      SET ${updates.join(', ')}
      WHERE id = ?
    `,
    [...values, input.id]
  );

  if (result.affectedRows === 0) {
    throw new Error('TARIFF_PACKAGE_NOT_FOUND');
  }
}

export type JournalLessonStatus = 'planned' | 'overdue' | 'completed' | 'rescheduled' | 'canceled';

export type JournalTeacherBasic = {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
};

export type WeeklyTemplateSlot = {
  id: string;
  weekday: number;
  start_time: string;
  start_from: string | null;
  is_active: 0 | 1;
  student_id?: string | null;
};

export type JournalLessonSlot = {
  id: string;
  teacher_id: string;
  student_id: string | null;
  student_full_name: string | null;
  student_paid_lessons_left: number | null;
  date: string;
  start_time: string;
  status: JournalLessonStatus;
  rescheduled_to_slot_id: string | null;
  reschedule_target_date?: string | null;
  reschedule_target_time?: string | null;
  source_weekly_slot_id: string | null;
  lock_version: number;
  status_changed_by_login?: string | null;
  status_changed_at?: string | null;
  status_reason?: string | null;
};

export async function findTeacherByUserId(userId: string): Promise<JournalTeacherBasic | null> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT
        id,
        first_name,
        last_name,
        CONCAT_WS(' ', first_name, last_name) AS full_name
      FROM teachers
      WHERE user_id = ? AND deleted_at IS NULL
      LIMIT 1
    `,
    [userId]
  );

  if (rows.length === 0) return null;

  return {
    id: String(rows[0].id),
    first_name: String(rows[0].first_name),
    last_name: String(rows[0].last_name),
    full_name: String(rows[0].full_name)
  };
}

export async function listActiveTeachersForJournal(): Promise<JournalTeacherBasic[]> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT
        id,
        first_name,
        last_name,
        CONCAT_WS(' ', first_name, last_name) AS full_name
      FROM teachers
      WHERE deleted_at IS NULL
      ORDER BY last_name ASC, first_name ASC
    `
  );

  return rows.map((row) => ({
    id: String(row.id),
    first_name: String(row.first_name),
    last_name: String(row.last_name),
    full_name: String(row.full_name)
  }));
}

export async function listTeacherStudentsForJournal(teacherId: string): Promise<Array<{
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  paid_lessons_left: number;
}>> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT
        id,
        first_name,
        last_name,
        CONCAT_WS(' ', first_name, last_name) AS full_name,
        paid_lessons_left
      FROM students
      WHERE assigned_teacher_id = ? AND deleted_at IS NULL AND entity_type = 'student'
      ORDER BY last_name ASC, first_name ASC
    `,
    [teacherId]
  );

  return rows.map((row) => ({
    id: String(row.id),
    first_name: String(row.first_name),
    last_name: String(row.last_name),
    full_name: String(row.full_name),
    paid_lessons_left: Number(row.paid_lessons_left ?? 0)
  }));
}

export async function listTeacherPlannedSlotCountsBeforeDate(input: {
  teacherId: string;
  date: string;
}): Promise<Array<{ student_id: string; planned_count: number }>> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT student_id, COUNT(*) AS planned_count
      FROM lesson_slots
      WHERE teacher_id = ?
        AND student_id IS NOT NULL
        AND status IN ('planned', 'overdue')
        AND date < ?
      GROUP BY student_id
    `,
    [input.teacherId, input.date]
  );

  return rows.map((row) => ({
    student_id: String(row.student_id),
    planned_count: Number(row.planned_count ?? 0)
  }));
}

export async function getTeacherWeeklyTemplate(teacherId: string): Promise<WeeklyTemplateSlot[]> {
  const pool = getPool();
  let hasStudentIdColumn = true;
  let hasStartFromColumn = true;
  let rows: mysql.RowDataPacket[] = [];
  const connection = await pool.getConnection();
  try {
    hasStudentIdColumn = await hasTeacherWeeklySlotStudentIdColumn(connection);
    hasStartFromColumn = await hasTeacherWeeklySlotStartFromColumn(connection);

    const [fetchedRows] = await connection.query<mysql.RowDataPacket[]>(
      `
        SELECT
          id,
          weekday,
          TIME_FORMAT(start_time, '%H:%i') AS start_time,
          is_active
          ${hasStudentIdColumn ? ', student_id' : ''}
          ${hasStartFromColumn ? ", DATE_FORMAT(start_from, '%Y-%m-%d') AS start_from" : ''}
        FROM teacher_weekly_slots
        WHERE teacher_id = ? AND is_active = 1
        ORDER BY weekday ASC, start_time ASC
      `,
      [teacherId]
    );
    rows = fetchedRows;
  } catch (error) {
    if (!isMysqlUnknownColumnError(error, 'student_id') && !isMysqlUnknownColumnError(error, 'start_from')) throw error;
    hasStudentIdColumn = false;
    hasStartFromColumn = false;
    const [fallbackRows] = await connection.query<mysql.RowDataPacket[]>(
      `
        SELECT
          id,
          weekday,
          TIME_FORMAT(start_time, '%H:%i') AS start_time,
          is_active
        FROM teacher_weekly_slots
        WHERE teacher_id = ? AND is_active = 1
        ORDER BY weekday ASC, start_time ASC
      `,
      [teacherId]
    );
    rows = fallbackRows;
  } finally {
    connection.release();
  }

  const result: WeeklyTemplateSlot[] = rows.map((row) => ({
    id: String(row.id),
    weekday: Number(row.weekday),
    start_time: String(row.start_time),
    start_from: hasStartFromColumn && row.start_from ? String(row.start_from) : null,
    is_active: Number(row.is_active) ? 1 : 0,
    student_id: row.student_id ? String(row.student_id) : null
  }));

  if (hasStudentIdColumn || result.length === 0) {
    return result;
  }

  // Backward compatibility for DBs without teacher_weekly_slots.student_id:
  // derive template student from nearest planned slots in the same weekly series.
  const slotIds = result.map((slot) => slot.id);
  const [plannedRows] = await pool.query<mysql.RowDataPacket[]>(
    `
      SELECT
        source_weekly_slot_id,
        student_id
      FROM lesson_slots
      WHERE teacher_id = ?
        AND source_weekly_slot_id IN (${slotIds.map(() => '?').join(', ')})
        AND student_id IS NOT NULL
        AND status = 'planned'
      ORDER BY date ASC, start_time ASC
    `,
    [teacherId, ...slotIds]
  );

  const derivedStudentByWeeklySlotId = new Map<string, string>();
  for (const row of plannedRows) {
    const weeklySlotId = String(row.source_weekly_slot_id);
    if (!derivedStudentByWeeklySlotId.has(weeklySlotId) && row.student_id) {
      derivedStudentByWeeklySlotId.set(weeklySlotId, String(row.student_id));
    }
  }

  return result.map((slot) => ({
    ...slot,
    student_id: derivedStudentByWeeklySlotId.get(slot.id) ?? null
  }));
}

export async function replaceTeacherWeeklyTemplate(input: {
  teacherId: string;
  actorUserId: string;
  slots: Array<{ weekday: number; startTime: string; startFrom?: string | null; studentId?: string | null; isActive?: boolean }>;
}): Promise<void> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [teacherRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT id FROM teachers WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [input.teacherId]
    );
    if (teacherRows.length === 0) throw new Error('TEACHER_NOT_FOUND');

    const hasWeeklySlotStudentIdColumn = await hasTeacherWeeklySlotStudentIdColumn(connection);
    const hasWeeklySlotStartFromColumn = await hasTeacherWeeklySlotStartFromColumn(connection);

    const [existingRows] = hasWeeklySlotStudentIdColumn
      ? await connection.query<mysql.RowDataPacket[]>(
          `
            SELECT id, student_id, weekday, TIME_FORMAT(start_time, '%H:%i') AS start_time
            ${hasWeeklySlotStartFromColumn ? ", DATE_FORMAT(start_from, '%Y-%m-%d') AS start_from" : ''}
            FROM teacher_weekly_slots
            WHERE teacher_id = ?
          `,
          [input.teacherId]
        )
      : await connection.query<mysql.RowDataPacket[]>(
          `
            SELECT id, weekday, TIME_FORMAT(start_time, '%H:%i') AS start_time
            ${hasWeeklySlotStartFromColumn ? ", DATE_FORMAT(start_from, '%Y-%m-%d') AS start_from" : ''}
            FROM teacher_weekly_slots
            WHERE teacher_id = ?
          `,
          [input.teacherId]
        );

    const existingByKey = new Map<string, { id: string; weekday: number; start_time: string; start_from: string | null; student_id: string | null }>();
    for (const row of existingRows) {
      const weekday = Number(row.weekday);
      const startTime = String(row.start_time);
      const startFrom = hasWeeklySlotStartFromColumn && row.start_from ? String(row.start_from) : null;
      const studentId = hasWeeklySlotStudentIdColumn && row.student_id ? String(row.student_id) : null;
      existingByKey.set(`${weekday}-${startTime}`, {
        id: String(row.id),
        weekday,
        start_time: startTime,
        start_from: startFrom,
        student_id: studentId
      });
    }

    const nextKeys = new Set<string>();
    const uniqueSlots: Array<{ weekday: number; startTime: string; startFrom: string | null; studentId: string | null; isActive: boolean }> = [];
    for (const slot of input.slots) {
      const key = `${slot.weekday}-${slot.startTime}`;
      if (nextKeys.has(key)) continue;
      nextKeys.add(key);
      await assertStudentBelongsToTeacher(connection, input.teacherId, slot.studentId ?? null);
      const normalizedStartFrom = slot.startFrom ?? null;
      uniqueSlots.push({
        weekday: slot.weekday,
        startTime: slot.startTime,
        startFrom: normalizedStartFrom,
        studentId: slot.studentId ?? null,
        isActive: slot.isActive ?? true
      });
    }

    const weeklySlotIdByKey = new Map<string, string>();
    for (const [key, value] of existingByKey.entries()) {
      weeklySlotIdByKey.set(key, value.id);
    }

    for (const slot of uniqueSlots) {
      const slotKey = `${slot.weekday}-${slot.startTime}`;
      const existing = existingByKey.get(slotKey);
      if (existing) {
        if (hasWeeklySlotStudentIdColumn) {
          if (hasWeeklySlotStartFromColumn) {
            await connection.query(`UPDATE teacher_weekly_slots SET is_active = ?, student_id = ?, start_from = ? WHERE id = ?`, [
              slot.isActive ? 1 : 0,
              slot.studentId,
              slot.startFrom,
              existing.id
            ]);
          } else {
            await connection.query(`UPDATE teacher_weekly_slots SET is_active = ?, student_id = ? WHERE id = ?`, [
              slot.isActive ? 1 : 0,
              slot.studentId,
              existing.id
            ]);
          }
          if (existing.student_id !== slot.studentId) {
            await syncWeeklyStudentAssignment(connection, {
              teacherId: input.teacherId,
              sourceWeeklySlotId: existing.id,
              fromDate: formatIsoDate(new Date()),
              studentId: slot.studentId
            });
          }
        } else {
          if (hasWeeklySlotStartFromColumn) {
            await connection.query(`UPDATE teacher_weekly_slots SET is_active = ?, start_from = ? WHERE id = ?`, [
              slot.isActive ? 1 : 0,
              slot.startFrom,
              existing.id
            ]);
          } else {
            await connection.query(`UPDATE teacher_weekly_slots SET is_active = ? WHERE id = ?`, [slot.isActive ? 1 : 0, existing.id]);
          }
        }

        if (hasWeeklySlotStartFromColumn && existing.start_from !== slot.startFrom && slot.startFrom) {
          await connection.query(
            `
              DELETE FROM lesson_slots
              WHERE teacher_id = ?
                AND source_weekly_slot_id = ?
                AND status = 'planned'
                AND date >= CURRENT_DATE()
                AND date < ?
            `,
            [input.teacherId, existing.id, slot.startFrom]
          );
        }
        weeklySlotIdByKey.set(slotKey, existing.id);
        continue;
      }

      if (hasWeeklySlotStudentIdColumn) {
        const newId = randomUUID();
        if (hasWeeklySlotStartFromColumn) {
          await connection.query(
            `
              INSERT INTO teacher_weekly_slots (id, teacher_id, student_id, weekday, start_time, start_from, is_active)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            [newId, input.teacherId, slot.studentId, slot.weekday, `${slot.startTime}:00`, slot.startFrom, slot.isActive ? 1 : 0]
          );
        } else {
          await connection.query(
            `
              INSERT INTO teacher_weekly_slots (id, teacher_id, student_id, weekday, start_time, is_active)
              VALUES (?, ?, ?, ?, ?, ?)
            `,
            [newId, input.teacherId, slot.studentId, slot.weekday, `${slot.startTime}:00`, slot.isActive ? 1 : 0]
          );
        }
        weeklySlotIdByKey.set(slotKey, newId);
      } else {
        const newId = randomUUID();
        if (hasWeeklySlotStartFromColumn) {
          await connection.query(
            `
              INSERT INTO teacher_weekly_slots (id, teacher_id, weekday, start_time, start_from, is_active)
              VALUES (?, ?, ?, ?, ?, ?)
            `,
            [newId, input.teacherId, slot.weekday, `${slot.startTime}:00`, slot.startFrom, slot.isActive ? 1 : 0]
          );
        } else {
          await connection.query(
            `
              INSERT INTO teacher_weekly_slots (id, teacher_id, weekday, start_time, is_active)
              VALUES (?, ?, ?, ?, ?)
            `,
            [newId, input.teacherId, slot.weekday, `${slot.startTime}:00`, slot.isActive ? 1 : 0]
          );
        }
        weeklySlotIdByKey.set(slotKey, newId);
      }
    }

    if (!hasWeeklySlotStudentIdColumn) {
      const fromDate = formatIsoDate(new Date());
      const toDate = new Date();
      toDate.setUTCDate(toDate.getUTCDate() + 42);
      const dateTo = formatIsoDate(toDate);

      await ensureTemplateSlotsForRange(connection, input.teacherId, fromDate, dateTo);

      for (const slot of uniqueSlots) {
        const sourceWeeklySlotId = weeklySlotIdByKey.get(`${slot.weekday}-${slot.startTime}`);
        if (!sourceWeeklySlotId) continue;
        await syncWeeklyStudentAssignment(connection, {
          teacherId: input.teacherId,
          sourceWeeklySlotId,
          fromDate,
          studentId: slot.studentId
        });
      }
    }

    const idsToDeactivate: string[] = [];
    for (const [key, value] of existingByKey.entries()) {
      if (!nextKeys.has(key)) idsToDeactivate.push(value.id);
    }

    if (idsToDeactivate.length > 0) {
      await connection.query(
        `
          DELETE FROM lesson_slots
          WHERE teacher_id = ?
            AND source_weekly_slot_id IN (${idsToDeactivate.map(() => '?').join(', ')})
            AND date >= CURRENT_DATE()
        `,
        [input.teacherId, ...idsToDeactivate]
      );

      await connection.query(
        `UPDATE teacher_weekly_slots SET is_active = 0 WHERE id IN (${idsToDeactivate.map(() => '?').join(', ')})`,
        idsToDeactivate
      );
    }

    await writeAuditLog(connection, {
      actorUserId: input.actorUserId,
      entityType: 'journal_weekly_template',
      entityId: input.teacherId,
      action: 'replace',
      diffAfter: { slots: uniqueSlots }
    });

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listTeacherLessonSlots(input: {
  teacherId: string;
  dateFrom: string;
  dateTo: string;
}): Promise<JournalLessonSlot[]> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT
        ls.id,
        ls.teacher_id,
        ls.student_id,
        CONCAT_WS(' ', s.first_name, s.last_name) AS student_full_name,
        s.paid_lessons_left AS student_paid_lessons_left,
        DATE_FORMAT(ls.date, '%Y-%m-%d') AS date,
        TIME_FORMAT(ls.start_time, '%H:%i') AS start_time,
        CASE
          WHEN ls.status NOT IN ('completed', 'canceled', 'rescheduled')
            AND ls.date < DATE(UTC_TIMESTAMP() + INTERVAL 3 HOUR)
            THEN 'overdue'
          WHEN ls.status = 'overdue'
            AND ls.date >= DATE(UTC_TIMESTAMP() + INTERVAL 3 HOUR)
            THEN 'planned'
          ELSE ls.status
        END AS status,
        ls.rescheduled_to_slot_id,
        DATE_FORMAT(rsl.date, '%Y-%m-%d') AS reschedule_target_date,
        TIME_FORMAT(rsl.start_time, '%H:%i') AS reschedule_target_time,
        COALESCE(ls.source_weekly_slot_id, reschedule_source.inherited_source_weekly_slot_id) AS source_weekly_slot_id,
        UNIX_TIMESTAMP(ls.updated_at) AS lock_version,
        status_audit.created_at AS status_changed_at,
        actor.login AS status_changed_by_login,
        JSON_UNQUOTE(JSON_EXTRACT(status_audit.diff_after, '$.reason')) AS status_reason
      FROM lesson_slots ls
      LEFT JOIN students s ON s.id = ls.student_id
      LEFT JOIN lesson_slots rsl ON rsl.id = ls.rescheduled_to_slot_id
      LEFT JOIN (
        SELECT
          rescheduled_to_slot_id AS target_slot_id,
          MAX(source_weekly_slot_id) AS inherited_source_weekly_slot_id
        FROM lesson_slots
        WHERE rescheduled_to_slot_id IS NOT NULL
        GROUP BY rescheduled_to_slot_id
      ) reschedule_source ON reschedule_source.target_slot_id = ls.id
      LEFT JOIN (
        SELECT entity_id, MAX(id) AS latest_audit_id
        FROM audit_logs
        WHERE entity_type = 'lesson_slot' AND action = 'status_update'
        GROUP BY entity_id
      ) latest_status_audit ON latest_status_audit.entity_id = ls.id
      LEFT JOIN audit_logs status_audit ON status_audit.id = latest_status_audit.latest_audit_id
      LEFT JOIN users actor ON actor.id = status_audit.actor_user_id
      WHERE ls.teacher_id = ? AND ls.date BETWEEN ? AND ?
      ORDER BY ls.date ASC, ls.start_time ASC
    `,
    [input.teacherId, input.dateFrom, input.dateTo]
  );

  return rows.map((row) => ({
    id: String(row.id),
    teacher_id: String(row.teacher_id),
    student_id: row.student_id ? String(row.student_id) : null,
    student_full_name: row.student_full_name ? String(row.student_full_name) : null,
    student_paid_lessons_left: row.student_paid_lessons_left !== null ? Number(row.student_paid_lessons_left) : null,
    date: String(row.date),
    start_time: String(row.start_time),
    status: String(row.status) as JournalLessonStatus,
    rescheduled_to_slot_id: row.rescheduled_to_slot_id ? String(row.rescheduled_to_slot_id) : null,
    reschedule_target_date: row.reschedule_target_date ? String(row.reschedule_target_date) : null,
    reschedule_target_time: row.reschedule_target_time ? String(row.reschedule_target_time) : null,
    source_weekly_slot_id: row.source_weekly_slot_id ? String(row.source_weekly_slot_id) : null,
    lock_version: Number(row.lock_version ?? 0),
    status_changed_by_login: row.status_changed_by_login ? String(row.status_changed_by_login) : null,
    status_changed_at: row.status_changed_at ? new Date(row.status_changed_at).toISOString() : null,
    status_reason: row.status_reason ? String(row.status_reason) : null
  }));
}

export async function syncTeacherLessonSlotsForRange(input: {
  teacherId: string;
  dateFrom: string;
  dateTo: string;
}): Promise<void> {
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await markOverduePlannedSlots(connection, { teacherId: input.teacherId });
    await ensureTemplateSlotsForRange(connection, input.teacherId, input.dateFrom, input.dateTo);
    await markOverduePlannedSlots(connection, { teacherId: input.teacherId });
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getTeacherLessonSlotStudentId(input: {
  id: string;
  teacherId: string;
}): Promise<string | null> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT student_id
      FROM lesson_slots
      WHERE id = ? AND teacher_id = ?
      LIMIT 1
    `,
    [input.id, input.teacherId]
  );

  if (rows.length === 0) return null;
  return rows[0].student_id ? String(rows[0].student_id) : null;
}

export async function listStudentIdsAffectedByWeeklySeriesDelete(input: {
  id: string;
  teacherId: string;
}): Promise<string[]> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT DISTINCT affected.student_id
      FROM (
        SELECT ls.student_id
        FROM lesson_slots ls
        INNER JOIN lesson_slots current_slot
          ON current_slot.id = ?
         AND current_slot.teacher_id = ?
         AND current_slot.source_weekly_slot_id IS NOT NULL
        WHERE ls.teacher_id = current_slot.teacher_id
          AND ls.source_weekly_slot_id = current_slot.source_weekly_slot_id
          AND ls.date >= current_slot.date
          AND ls.student_id IS NOT NULL

        UNION

        SELECT target.student_id
        FROM lesson_slots source_slot
        INNER JOIN lesson_slots current_slot
          ON current_slot.id = ?
         AND current_slot.teacher_id = ?
         AND current_slot.source_weekly_slot_id IS NOT NULL
        INNER JOIN lesson_slots target
          ON target.id = source_slot.rescheduled_to_slot_id
        WHERE source_slot.teacher_id = current_slot.teacher_id
          AND source_slot.source_weekly_slot_id = current_slot.source_weekly_slot_id
          AND source_slot.date >= current_slot.date
          AND source_slot.rescheduled_to_slot_id IS NOT NULL
          AND target.student_id IS NOT NULL
      ) AS affected
    `,
    [input.id, input.teacherId, input.id, input.teacherId]
  );

  return rows.map((row) => String(row.student_id));
}

async function syncStudentLessonTimeline(connection: mysql.PoolConnection, studentId: string | null): Promise<void> {
  if (!studentId) return;

  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `
      SELECT
        DATE_FORMAT(MIN(CASE WHEN status IN ('planned', 'overdue') THEN TIMESTAMP(date, start_time) END), '%Y-%m-%d %H:%i:%s') AS next_lesson_at,
        DATE_FORMAT(MAX(CASE WHEN status = 'completed' THEN TIMESTAMP(date, start_time) END), '%Y-%m-%d %H:%i:%s') AS last_lesson_at
      FROM lesson_slots
      WHERE student_id = ?
    `,
    [studentId]
  );

  const nextLessonAt = rows[0]?.next_lesson_at ? String(rows[0].next_lesson_at) : null;
  const lastLessonAt = rows[0]?.last_lesson_at ? String(rows[0].last_lesson_at) : null;

  await connection.query(
    `
      UPDATE students
      SET next_lesson_at = ?, last_lesson_at = ?
      WHERE id = ?
    `,
    [nextLessonAt, lastLessonAt, studentId]
  );
}

async function syncStudentLessonTimelineBatch(
  connection: mysql.PoolConnection,
  studentIds: Array<string | null | undefined>
): Promise<void> {
  const uniqueStudentIds = Array.from(new Set(studentIds.filter((studentId): studentId is string => Boolean(studentId))));
  for (const studentId of uniqueStudentIds) {
    await syncStudentLessonTimeline(connection, studentId);
  }
}

function enqueueStudentLessonTimelineSync(studentIds: Array<string | null | undefined>): void {
  const uniqueStudentIds = Array.from(new Set(studentIds.filter((studentId): studentId is string => Boolean(studentId))));
  if (uniqueStudentIds.length === 0) return;

  void (async () => {
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      await syncStudentLessonTimelineBatch(connection, uniqueStudentIds);
      await connection.commit();
    } catch (error) {
      try {
        await connection.rollback();
      } catch {
        // ignore rollback errors in background sync
      }
      console.error('Failed to sync student lesson timeline in background', error);
    } finally {
      connection.release();
    }
  })();
}

export async function createTeacherLessonSlot(input: {
  teacherId: string;
  actorUserId: string;
  date: string;
  startTime: string;
  studentId?: string | null;
  repeatWeekly?: boolean;
}): Promise<JournalLessonSlot> {
  const pool = getPool();
  const connection = await pool.getConnection();
  const slotId = randomUUID();

  try {
    await connection.beginTransaction();

    await assertTeacherExists(connection, input.teacherId);
    const hasWeeklySlotStudentIdColumn = await hasTeacherWeeklySlotStudentIdColumn(connection);

    let sourceWeeklySlotId: string | null = null;
    let templateStudentId: string | null = null;
    if (input.repeatWeekly) {
      const weekday = isoWeekday(parseIsoDate(input.date));
      const [templateRows] = hasWeeklySlotStudentIdColumn
        ? await connection.query<mysql.RowDataPacket[]>(
            `
              SELECT id, student_id
              FROM teacher_weekly_slots
              WHERE teacher_id = ?
                AND weekday = ?
                AND TIME_FORMAT(start_time, '%H:%i') = ?
                AND is_active = 1
              LIMIT 1
            `,
            [input.teacherId, weekday, input.startTime]
          )
        : await connection.query<mysql.RowDataPacket[]>(
            `
              SELECT id
              FROM teacher_weekly_slots
              WHERE teacher_id = ?
                AND weekday = ?
                AND TIME_FORMAT(start_time, '%H:%i') = ?
                AND is_active = 1
              LIMIT 1
            `,
            [input.teacherId, weekday, input.startTime]
          );

      if (templateRows.length === 0) {
        throw new Error('WEEKLY_TEMPLATE_SLOT_NOT_FOUND');
      }
      sourceWeeklySlotId = String(templateRows[0].id);
      if (hasWeeklySlotStudentIdColumn) {
        templateStudentId = templateRows[0].student_id ? String(templateRows[0].student_id) : null;
      } else {
        const [recentRows] = await connection.query<mysql.RowDataPacket[]>(
          `
            SELECT student_id
            FROM lesson_slots
            WHERE teacher_id = ?
              AND source_weekly_slot_id = ?
              AND student_id IS NOT NULL
            ORDER BY date DESC, start_time DESC
            LIMIT 1
          `,
          [input.teacherId, sourceWeeklySlotId]
        );
        templateStudentId = recentRows.length > 0 && recentRows[0].student_id ? String(recentRows[0].student_id) : null;
      }
    }

    const effectiveStudentId = input.studentId !== undefined ? input.studentId : templateStudentId;
    await assertStudentBelongsToTeacher(connection, input.teacherId, effectiveStudentId ?? null);
    await assertStudentTimeAvailability(connection, {
      studentId: effectiveStudentId ?? null,
      date: input.date,
      startTime: input.startTime
    });

    if (hasWeeklySlotStudentIdColumn && sourceWeeklySlotId && input.studentId !== undefined) {
      await connection.query(
        `
          UPDATE teacher_weekly_slots
          SET student_id = ?
          WHERE id = ? AND teacher_id = ?
        `,
        [effectiveStudentId ?? null, sourceWeeklySlotId, input.teacherId]
      );
    }

    await connection.query(
      `
        INSERT INTO lesson_slots (id, teacher_id, student_id, source_weekly_slot_id, date, start_time, status)
        VALUES (?, ?, ?, ?, ?, ?, 'planned')
      `,
      [slotId, input.teacherId, effectiveStudentId ?? null, sourceWeeklySlotId, input.date, `${input.startTime}:00`]
    );

    await syncStudentLessonTimeline(connection, effectiveStudentId ?? null);

    await writeAuditLog(connection, {
      actorUserId: input.actorUserId,
      entityType: 'lesson_slot',
      entityId: slotId,
      action: 'create',
      diffAfter: {
        teacher_id: input.teacherId,
        student_id: effectiveStudentId ?? null,
        source_weekly_slot_id: sourceWeeklySlotId,
        date: input.date,
        start_time: input.startTime,
        status: 'planned'
      }
    });

    const slot = await getLessonSlotById(connection, slotId);
    if (!slot) throw new Error('SLOT_NOT_FOUND');

    await connection.commit();
    return slot;
  } catch (error) {
    await connection.rollback();
    if (error instanceof Error && error.message === 'STUDENT_TIME_CONFLICT') {
      throw error;
    }
    if (isMysqlDuplicateError(error, 'uq_lesson_slots_teacher_datetime')) {
      const existing = await getLessonSlotByTeacherDateTime(connection, input.teacherId, input.date, input.startTime);
      if (!existing) {
        throw new Error('SLOT_ALREADY_EXISTS');
      }
      return existing;
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateTeacherLessonSlot(input: {
  id: string;
  teacherId: string;
  actorUserId: string;
  actorRole: 'admin' | 'teacher';
  expectedLockVersion?: number;
  date?: string;
  startTime?: string;
  studentId?: string | null;
}): Promise<JournalLessonSlot> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const current = await getLessonSlotByIdForUpdate(connection, input.id);
    if (!current) throw new Error('SLOT_NOT_FOUND');
    if (current.teacher_id !== input.teacherId) throw new Error('FORBIDDEN');
    assertTeacherConflictLock(input.expectedLockVersion, current.lock_version, input.actorRole);
    if (current.status === 'completed') throw new Error('SLOT_EDIT_COMPLETED_FORBIDDEN');

    const nextDate = input.date ?? current.date;
    const nextStartTime = input.startTime ?? current.start_time;
    const nextStudentId = input.studentId !== undefined ? input.studentId : current.student_id;

    await assertStudentBelongsToTeacher(connection, input.teacherId, nextStudentId);
    await assertStudentTimeAvailability(connection, {
      studentId: nextStudentId,
      date: nextDate,
      startTime: nextStartTime,
      excludeSlotId: input.id
    });

    if (current.source_weekly_slot_id && input.studentId !== undefined) {
      await syncWeeklyStudentAssignment(connection, {
        teacherId: input.teacherId,
        sourceWeeklySlotId: current.source_weekly_slot_id,
        fromDate: current.date,
        studentId: nextStudentId
      });
    }

    await connection.query(
      `
        UPDATE lesson_slots
        SET student_id = ?, date = ?, start_time = ?
        WHERE id = ?
      `,
      [nextStudentId, nextDate, `${nextStartTime}:00`, input.id]
    );

    if (!nextStudentId) {
      await connection.query(`UPDATE lesson_slots SET status = 'planned' WHERE id = ? AND status = 'overdue'`, [input.id]);
    }

    await syncStudentLessonTimelineBatch(connection, [current.student_id, nextStudentId]);

    await writeAuditLog(connection, {
      actorUserId: input.actorUserId,
      entityType: 'lesson_slot',
      entityId: input.id,
      action: 'update',
      diffBefore: {
        student_id: current.student_id,
        date: current.date,
        start_time: current.start_time
      },
      diffAfter: {
        student_id: nextStudentId,
        date: nextDate,
        start_time: nextStartTime
      }
    });

    const slot = await getLessonSlotById(connection, input.id);
    if (!slot) throw new Error('SLOT_NOT_FOUND');

    await connection.commit();
    return slot;
  } catch (error) {
    await connection.rollback();
    if (isMysqlDuplicateError(error, 'uq_lesson_slots_teacher_datetime')) {
      throw new Error('SLOT_ALREADY_EXISTS');
    }
    if (error instanceof Error && error.message === 'STUDENT_TIME_CONFLICT') {
      throw error;
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function deleteTeacherLessonSlot(input: {
  id: string;
  teacherId: string;
  actorUserId: string;
  actorRole: 'admin' | 'teacher';
  expectedLockVersion?: number;
}): Promise<void> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const current = await getLessonSlotByIdForUpdate(connection, input.id);
    if (!current) throw new Error('SLOT_NOT_FOUND');
    if (current.teacher_id !== input.teacherId) throw new Error('FORBIDDEN');
    assertTeacherConflictLock(input.expectedLockVersion, current.lock_version, input.actorRole);
    const [rescheduleSourceRows] = await connection.query<mysql.RowDataPacket[]>(
      `
        SELECT id, student_id
        FROM lesson_slots
        WHERE rescheduled_to_slot_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [input.id]
    );
    const isRescheduleTarget = rescheduleSourceRows.length > 0;
    if (current.rescheduled_to_slot_id) {
      throw new Error('SLOT_RESCHEDULE_SOURCE_DELETE_FORBIDDEN');
    }
    if (current.status !== 'planned' && !isRescheduleTarget) {
      throw new Error('SLOT_DELETE_ONLY_PLANNED');
    }

    // If this slot is a reschedule target, detach all sources first so the target can be safely removed.
    await connection.query(
      `
        UPDATE lesson_slots
        SET
          status = CASE
            WHEN status = 'rescheduled'
              THEN CASE
                WHEN date < DATE(UTC_TIMESTAMP() + INTERVAL 3 HOUR) THEN 'overdue'
                ELSE 'planned'
              END
            ELSE status
          END,
          rescheduled_to_slot_id = NULL
        WHERE rescheduled_to_slot_id = ?
      `,
      [input.id]
    );

    if (isRescheduleTarget && current.status === 'completed') {
      await adjustStudentPaidLessons(connection, current.student_id, +1);
    }

    await connection.query(`DELETE FROM lesson_slots WHERE id = ?`, [input.id]);

    await syncStudentLessonTimelineBatch(connection, [
      current.student_id,
      ...rescheduleSourceRows.map((row) => (row.student_id ? String(row.student_id) : null))
    ]);

    await writeAuditLog(connection, {
      actorUserId: input.actorUserId,
      entityType: 'lesson_slot',
      entityId: input.id,
      action: 'delete',
      diffBefore: {
        teacher_id: current.teacher_id,
        student_id: current.student_id,
        date: current.date,
        start_time: current.start_time,
        status: current.status,
        source_weekly_slot_id: current.source_weekly_slot_id,
        rescheduled_to_slot_id: current.rescheduled_to_slot_id
      }
    });

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function deleteTeacherWeeklySeriesFromSlot(input: {
  id: string;
  teacherId: string;
  actorUserId: string;
  actorRole: 'admin' | 'teacher';
  expectedLockVersion?: number;
}): Promise<void> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const current = await getLessonSlotByIdForUpdate(connection, input.id);
    if (!current) throw new Error('SLOT_NOT_FOUND');
    if (current.teacher_id !== input.teacherId) throw new Error('FORBIDDEN');
    assertTeacherConflictLock(input.expectedLockVersion, current.lock_version, input.actorRole);
    if (!current.source_weekly_slot_id) throw new Error('WEEKLY_SLOT_REQUIRED');
    if (current.status !== 'planned') throw new Error('SLOT_DELETE_COMPLETED');

    await connection.query(
      `
        UPDATE teacher_weekly_slots
        SET is_active = 0
        WHERE id = ? AND teacher_id = ?
      `,
      [current.source_weekly_slot_id, input.teacherId]
    );

    const [rescheduleSourceRows] = await connection.query<mysql.RowDataPacket[]>(
      `
        SELECT id, student_id, rescheduled_to_slot_id
        FROM lesson_slots
        WHERE teacher_id = ?
          AND source_weekly_slot_id = ?
          AND date >= ?
          AND rescheduled_to_slot_id IS NOT NULL
        FOR UPDATE
      `,
      [input.teacherId, current.source_weekly_slot_id, current.date]
    );
    const rescheduleSourceIds = rescheduleSourceRows.map((row) => String(row.id));
    const targetIds = Array.from(
      new Set(
        rescheduleSourceRows
          .map((row) => row.rescheduled_to_slot_id)
          .filter((value): value is string => Boolean(value))
          .map((value) => String(value))
      )
    );
    const [seriesStudentRows] = await connection.query<mysql.RowDataPacket[]>(
      `
        SELECT DISTINCT student_id
        FROM lesson_slots
        WHERE teacher_id = ?
          AND source_weekly_slot_id = ?
          AND date >= ?
          AND student_id IS NOT NULL
      `,
      [input.teacherId, current.source_weekly_slot_id, current.date]
    );

    if (rescheduleSourceIds.length > 0) {
      const placeholders = rescheduleSourceIds.map(() => '?').join(', ');
      await connection.query(
        `
          UPDATE lesson_slots
          SET
            status = CASE
              WHEN status = 'rescheduled'
                THEN CASE
                  WHEN date < DATE(UTC_TIMESTAMP() + INTERVAL 3 HOUR) THEN 'overdue'
                  ELSE 'planned'
                END
              ELSE status
            END,
            rescheduled_to_slot_id = NULL
          WHERE id IN (${placeholders})
        `,
        rescheduleSourceIds
      );
    }

    for (const targetId of targetIds) {
      await releaseRescheduledTargetSlot(connection, { slotId: targetId, allowCompleted: true });
    }

    await connection.query(
      `
        DELETE FROM lesson_slots
        WHERE teacher_id = ?
          AND source_weekly_slot_id = ?
          AND date >= ?
          AND status = 'planned'
      `,
      [input.teacherId, current.source_weekly_slot_id, current.date]
    );

    await syncStudentLessonTimelineBatch(connection, [
      ...rescheduleSourceRows.map((row) => (row.student_id ? String(row.student_id) : null)),
      ...seriesStudentRows.map((row) => (row.student_id ? String(row.student_id) : null))
    ]);

    await writeAuditLog(connection, {
      actorUserId: input.actorUserId,
      entityType: 'lesson_slot',
      entityId: input.id,
      action: 'delete_series',
      diffBefore: {
        teacher_id: current.teacher_id,
        source_weekly_slot_id: current.source_weekly_slot_id,
        from_date: current.date
      }
    });

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateTeacherLessonSlotStatus(input: {
  id: string;
  teacherId: string;
  actorUserId: string;
  actorRole: 'admin' | 'teacher';
  expectedLockVersion?: number;
  status: JournalLessonStatus;
  studentId?: string | null;
  reason?: string;
  rescheduleToDate?: string;
  rescheduleToTime?: string;
}): Promise<JournalLessonSlot> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await markOverduePlannedSlots(connection, { slotId: input.id });
    const current = await getLessonSlotByIdForUpdate(connection, input.id);
    if (!current) throw new Error('SLOT_NOT_FOUND');
    if (current.teacher_id !== input.teacherId) throw new Error('FORBIDDEN');
    assertTeacherConflictLock(input.expectedLockVersion, current.lock_version, input.actorRole);
    const isRescheduleToSourceDate =
      input.status === 'rescheduled' &&
      input.rescheduleToDate === current.date &&
      input.rescheduleToTime === current.start_time;
    const normalizedStatus: JournalLessonStatus = isRescheduleToSourceDate ? 'planned' : input.status;

    // A rescheduled target should not be moved back to the source slot date/time.
    // It produces ambiguous state transitions and breaks reschedule linkage semantics.
    if (input.status === 'rescheduled' && current.status === 'rescheduled' && isRescheduleToSourceDate) {
      throw new Error('RESCHEDULE_TO_SOURCE_DATETIME_FORBIDDEN');
    }

    if (current.status === 'completed' && (input.status === 'canceled' || input.status === 'rescheduled')) {
      throw new Error('SLOT_COMPLETED_STATUS_CHANGE_FORBIDDEN');
    }
    if (current.status === 'overdue' && normalizedStatus === 'planned') {
      throw new Error('SLOT_OVERDUE_TO_PLANNED_FORBIDDEN');
    }
    if (current.status === 'canceled' && normalizedStatus === 'rescheduled') {
      throw new Error('SLOT_CANCELED_RESCHEDULE_FORBIDDEN');
    }
    if (normalizedStatus === 'completed' && current.date > getCurrentMskIsoDate()) {
      throw new Error('SLOT_COMPLETED_FUTURE_DATE_FORBIDDEN');
    }

    const nextStudentId = input.studentId !== undefined ? input.studentId : current.student_id;
    await assertStudentBelongsToTeacher(connection, input.teacherId, nextStudentId);

    if (normalizedStatus === 'completed' && !nextStudentId) {
      throw new Error('SLOT_STUDENT_REQUIRED');
    }

    if (normalizedStatus === 'rescheduled' && (!input.rescheduleToDate || !input.rescheduleToTime)) {
      throw new Error('RESCHEDULE_TARGET_REQUIRED');
    }

    const normalizedReason = input.reason?.trim();
    if ((input.status === 'rescheduled' || input.status === 'canceled') && !normalizedReason) {
      throw new Error('STATUS_REASON_REQUIRED');
    }

    const rescheduleSourceSlot = await getRescheduleSourceSlotByTargetForUpdate(connection, current.id, current.teacher_id);
    if (normalizedStatus === 'rescheduled' && rescheduleSourceSlot) {
      const sourceIsRescheduleToSourceDate =
        input.rescheduleToDate === rescheduleSourceSlot.date && input.rescheduleToTime === rescheduleSourceSlot.start_time;
      const sourceNextStatus: JournalLessonStatus = sourceIsRescheduleToSourceDate ? 'planned' : 'rescheduled';
      const sourceNextStudentId =
        input.studentId !== undefined ? input.studentId : rescheduleSourceSlot.student_id;
      await assertStudentBelongsToTeacher(connection, input.teacherId, sourceNextStudentId);

      const sourcePrevTargetId = rescheduleSourceSlot.rescheduled_to_slot_id;
      let sourceNextTargetId: string | null = sourcePrevTargetId;

      if (sourceNextStatus === 'rescheduled') {
        sourceNextTargetId = await upsertRescheduledTargetSlot(connection, {
          teacherId: rescheduleSourceSlot.teacher_id,
          studentId: sourceNextStudentId,
          date: input.rescheduleToDate!,
          startTime: input.rescheduleToTime!
        });
      } else {
        sourceNextTargetId = null;
      }

      await connection.query(
        `
          UPDATE lesson_slots
          SET student_id = ?, status = ?, rescheduled_to_slot_id = ?
          WHERE id = ?
        `,
        [sourceNextStudentId, sourceNextStatus, sourceNextTargetId, rescheduleSourceSlot.id]
      );

      if (sourcePrevTargetId && sourcePrevTargetId !== sourceNextTargetId) {
        await releaseRescheduledTargetSlot(connection, { slotId: sourcePrevTargetId });
      }

      await markOverduePlannedSlots(connection, { slotId: rescheduleSourceSlot.id });

      await writeAuditLog(connection, {
        actorUserId: input.actorUserId,
        entityType: 'lesson_slot',
        entityId: rescheduleSourceSlot.id,
        action: 'status_update',
        diffBefore: {
          student_id: rescheduleSourceSlot.student_id,
          status: rescheduleSourceSlot.status,
          rescheduled_to_slot_id: rescheduleSourceSlot.rescheduled_to_slot_id
        },
        diffAfter: {
          student_id: sourceNextStudentId,
          status: sourceNextStatus,
          rescheduled_to_slot_id: sourceNextTargetId,
          reason: normalizedReason ?? null
        }
      });

      if (sourceNextTargetId !== current.id) {
        await deleteDetachedRescheduleIntermediateSlot(connection, {
          slotId: current.id,
          teacherId: current.teacher_id
        });
      }

      const timelineSyncStudentIds = [
        current.student_id,
        nextStudentId,
        rescheduleSourceSlot.student_id,
        sourceNextStudentId
      ];

      const slot = await getLessonSlotById(connection, rescheduleSourceSlot.id);
      if (!slot) throw new Error('SLOT_NOT_FOUND');

      await connection.commit();
      enqueueStudentLessonTimelineSync(timelineSyncStudentIds);
      return slot;
    }

    if (current.status === normalizedStatus) {
      if (normalizedStatus !== 'rescheduled') {
        const unchanged = await getLessonSlotById(connection, input.id);
        if (!unchanged) throw new Error('SLOT_NOT_FOUND');
        await connection.commit();
        return unchanged;
      }

      if (current.rescheduled_to_slot_id && input.rescheduleToDate && input.rescheduleToTime) {
        const target = await getLessonSlotById(connection, current.rescheduled_to_slot_id);
        if (target && target.date === input.rescheduleToDate && target.start_time === input.rescheduleToTime) {
          const unchanged = await getLessonSlotById(connection, input.id);
          if (!unchanged) throw new Error('SLOT_NOT_FOUND');
          await connection.commit();
          return unchanged;
        }
      }
    }

    if (nextStudentId !== current.student_id) {
      await assertStudentTimeAvailability(connection, {
        studentId: nextStudentId,
        date: current.date,
        startTime: current.start_time,
        excludeSlotId: current.id
      });
    }

    if (current.status !== 'completed' && normalizedStatus === 'completed') {
      await assertStudentHasNoEarlierUnconfirmedSlots(connection, {
        teacherId: current.teacher_id,
        studentId: nextStudentId,
        beforeDate: current.date,
        beforeStartTime: current.start_time,
        excludeSlotId: current.id
      });
    }

    if (current.status !== 'completed' && normalizedStatus === 'completed') {
      await adjustStudentPaidLessons(connection, nextStudentId, -1);
    }

    if (current.status === 'completed' && normalizedStatus !== 'completed') {
      await adjustStudentPaidLessons(connection, current.student_id, +1);
    }

    const previousRescheduledToSlotId = current.rescheduled_to_slot_id;
    let rescheduledToSlotId: string | null = current.rescheduled_to_slot_id;
    if (normalizedStatus === 'rescheduled') {
      rescheduledToSlotId = await upsertRescheduledTargetSlot(connection, {
        teacherId: current.teacher_id,
        studentId: nextStudentId,
        date: input.rescheduleToDate!,
        startTime: input.rescheduleToTime!
      });
    } else if (current.status === 'rescheduled') {
      rescheduledToSlotId = null;
    }

    await connection.query(
      `
        UPDATE lesson_slots
        SET student_id = ?, status = ?, rescheduled_to_slot_id = ?
        WHERE id = ?
      `,
      [nextStudentId, normalizedStatus, rescheduledToSlotId, input.id]
    );

    if (previousRescheduledToSlotId && previousRescheduledToSlotId !== rescheduledToSlotId) {
      await releaseRescheduledTargetSlot(connection, {
        slotId: previousRescheduledToSlotId
      });
    }

    await markOverduePlannedSlots(connection, { slotId: input.id });

    await writeAuditLog(connection, {
      actorUserId: input.actorUserId,
      entityType: 'lesson_slot',
      entityId: input.id,
      action: 'status_update',
      diffBefore: {
        student_id: current.student_id,
        status: current.status,
        rescheduled_to_slot_id: current.rescheduled_to_slot_id
      },
      diffAfter: {
        student_id: nextStudentId,
        status: normalizedStatus,
        rescheduled_to_slot_id: rescheduledToSlotId,
        reason: normalizedReason ?? null
      }
    });

    const timelineSyncStudentIds = [current.student_id, nextStudentId];

    const slot = await getLessonSlotById(connection, input.id);
    if (!slot) throw new Error('SLOT_NOT_FOUND');

    await connection.commit();
    enqueueStudentLessonTimelineSync(timelineSyncStudentIds);
    return slot;
  } catch (error) {
    await connection.rollback();
    if (error instanceof Error && error.message === 'STUDENT_TIME_CONFLICT') {
      throw error;
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function releaseRescheduledTargetSlot(
  connection: mysql.PoolConnection,
  input: { slotId: string; allowCompleted?: boolean }
): Promise<void> {
  const [referenceRows] = await connection.query<mysql.RowDataPacket[]>(
    `
      SELECT COUNT(*) AS refs_count
      FROM lesson_slots
      WHERE rescheduled_to_slot_id = ?
    `,
    [input.slotId]
  );
  const refsCount = Number(referenceRows[0]?.refs_count ?? 0);
  if (refsCount > 0) return;

  const [slotRows] = await connection.query<mysql.RowDataPacket[]>(
    `
      SELECT id, status, student_id, source_weekly_slot_id
      FROM lesson_slots
      WHERE id = ?
      LIMIT 1
      FOR UPDATE
    `,
    [input.slotId]
  );
  if (slotRows.length === 0) return;

  const slotStatus = String(slotRows[0].status ?? '');
  const sourceWeeklySlotId = slotRows[0].source_weekly_slot_id ? String(slotRows[0].source_weekly_slot_id) : null;
  if (sourceWeeklySlotId) return;

  if (slotStatus === 'completed') {
    if (!input.allowCompleted) return;
    const studentId = slotRows[0].student_id ? String(slotRows[0].student_id) : null;
    await adjustStudentPaidLessons(connection, studentId, +1);
    await connection.query(`DELETE FROM lesson_slots WHERE id = ?`, [input.slotId]);
    return;
  }

  await connection.query(
    `
      DELETE FROM lesson_slots
      WHERE id = ?
        AND status IN ('planned', 'overdue')
    `,
    [input.slotId]
  );
}

async function getRescheduleSourceSlotByTargetForUpdate(
  connection: mysql.PoolConnection,
  targetSlotId: string,
  teacherId: string
): Promise<JournalLessonSlot | null> {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `
      SELECT id
      FROM lesson_slots
      WHERE teacher_id = ?
        AND rescheduled_to_slot_id = ?
      LIMIT 1
      FOR UPDATE
    `,
    [teacherId, targetSlotId]
  );
  if (rows.length === 0) return null;
  return getLessonSlotById(connection, String(rows[0].id));
}

async function deleteDetachedRescheduleIntermediateSlot(
  connection: mysql.PoolConnection,
  input: { slotId: string; teacherId: string }
): Promise<void> {
  const [referenceRows] = await connection.query<mysql.RowDataPacket[]>(
    `
      SELECT COUNT(*) AS refs_count
      FROM lesson_slots
      WHERE rescheduled_to_slot_id = ?
    `,
    [input.slotId]
  );
  const refsCount = Number(referenceRows[0]?.refs_count ?? 0);
  if (refsCount > 0) return;

  await connection.query(
    `
      DELETE FROM lesson_slots
      WHERE id = ?
        AND teacher_id = ?
        AND source_weekly_slot_id IS NULL
    `,
    [input.slotId, input.teacherId]
  );
}

async function ensureTemplateSlotsForRange(
  connection: mysql.PoolConnection,
  teacherId: string,
  dateFrom: string,
  dateTo: string
): Promise<void> {
  const hasWeeklySlotStudentIdColumn = await hasTeacherWeeklySlotStudentIdColumn(connection);
  const hasWeeklySlotStartFromColumn = await hasTeacherWeeklySlotStartFromColumn(connection);
  const [templateRows] = hasWeeklySlotStudentIdColumn
    ? await connection.query<mysql.RowDataPacket[]>(
        `
          SELECT id, student_id, weekday, TIME_FORMAT(start_time, '%H:%i') AS start_time
          ${hasWeeklySlotStartFromColumn ? ", DATE_FORMAT(start_from, '%Y-%m-%d') AS start_from" : ''}
          FROM teacher_weekly_slots
          WHERE teacher_id = ? AND is_active = 1
        `,
        [teacherId]
      )
    : await connection.query<mysql.RowDataPacket[]>(
        `
          SELECT id, weekday, TIME_FORMAT(start_time, '%H:%i') AS start_time
          ${hasWeeklySlotStartFromColumn ? ", DATE_FORMAT(start_from, '%Y-%m-%d') AS start_from" : ''}
          FROM teacher_weekly_slots
          WHERE teacher_id = ? AND is_active = 1
        `,
        [teacherId]
      );

  if (templateRows.length === 0) return;

  const candidates: Array<{ id: string; date: string; startTime: string; weeklySlotId: string; studentId: string | null }> = [];
  const startDate = parseIsoDate(dateFrom);
  const endDate = parseIsoDate(dateTo);
  const templates = templateRows.map((row) => ({
    id: String(row.id),
    studentId: hasWeeklySlotStudentIdColumn && row.student_id ? String(row.student_id) : null,
    startFrom: hasWeeklySlotStartFromColumn && row.start_from ? String(row.start_from) : null,
    weekday: Number(row.weekday),
    startTime: String(row.start_time)
  }));

  if (!hasWeeklySlotStudentIdColumn && templates.length > 0) {
    const [seriesRows] = await connection.query<mysql.RowDataPacket[]>(
      `
        SELECT source_weekly_slot_id, student_id
        FROM lesson_slots
        WHERE teacher_id = ?
          AND source_weekly_slot_id IN (${templates.map(() => '?').join(', ')})
          AND student_id IS NOT NULL
        ORDER BY date DESC, start_time DESC
      `,
      [teacherId, ...templates.map((item) => item.id)]
    );

    const fallbackStudentByWeeklyId = new Map<string, string>();
    for (const row of seriesRows) {
      const weeklyId = String(row.source_weekly_slot_id);
      if (fallbackStudentByWeeklyId.has(weeklyId)) continue;
      if (row.student_id) fallbackStudentByWeeklyId.set(weeklyId, String(row.student_id));
    }

    for (const template of templates) {
      if (template.studentId) continue;
      template.studentId = fallbackStudentByWeeklyId.get(template.id) ?? null;
    }
  }

  for (const date of iterateDatesInclusive(startDate, endDate)) {
      const weekday = isoWeekday(date);
      for (const slot of templates) {
        if (slot.weekday !== weekday) continue;
        if (slot.startFrom && formatIsoDate(date) < slot.startFrom) continue;
        candidates.push({
          id: randomUUID(),
          date: formatIsoDate(date),
        startTime: slot.startTime,
        weeklySlotId: slot.id,
        studentId: slot.studentId
      });
    }
  }

  if (candidates.length === 0) return;

  const valuesSql = candidates.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
  const values = candidates.flatMap((candidate) => [
    candidate.id,
    teacherId,
    candidate.studentId,
    candidate.weeklySlotId,
    candidate.date,
    `${candidate.startTime}:00`,
    'planned'
  ]);

  await connection.query(
    `
      INSERT INTO lesson_slots (id, teacher_id, student_id, source_weekly_slot_id, date, start_time, status)
      VALUES ${valuesSql}
      ON DUPLICATE KEY UPDATE id = id
    `,
    values
  );
}

async function syncWeeklyStudentAssignment(
  connection: mysql.PoolConnection,
  input: {
    teacherId: string;
    sourceWeeklySlotId: string;
    fromDate: string;
    studentId: string | null;
  }
): Promise<void> {
  const hasWeeklySlotStudentIdColumn = await hasTeacherWeeklySlotStudentIdColumn(connection);
  if (hasWeeklySlotStudentIdColumn) {
    await connection.query(
      `
        UPDATE teacher_weekly_slots
        SET student_id = ?
        WHERE id = ? AND teacher_id = ?
      `,
      [input.studentId, input.sourceWeeklySlotId, input.teacherId]
    );
  }

  const [futureRows] = await connection.query<mysql.RowDataPacket[]>(
    `
      SELECT id, DATE_FORMAT(date, '%Y-%m-%d') AS date, TIME_FORMAT(start_time, '%H:%i') AS start_time
      FROM lesson_slots
      WHERE teacher_id = ?
        AND source_weekly_slot_id = ?
        AND status = 'planned'
        AND date >= ?
    `,
    [input.teacherId, input.sourceWeeklySlotId, input.fromDate]
  );

  if (input.studentId) {
    for (const row of futureRows) {
      await assertStudentTimeAvailability(connection, {
        studentId: input.studentId,
        date: String(row.date),
        startTime: String(row.start_time),
        excludeSlotId: String(row.id)
      });
    }
  }

  await connection.query(
    `
      UPDATE lesson_slots
      SET student_id = ?
      WHERE teacher_id = ?
        AND source_weekly_slot_id = ?
        AND status = 'planned'
        AND date >= ?
    `,
    [input.studentId, input.teacherId, input.sourceWeeklySlotId, input.fromDate]
  );
}

async function getLessonSlotById(connection: mysql.PoolConnection, id: string): Promise<JournalLessonSlot | null> {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `
      SELECT
        ls.id,
        ls.teacher_id,
        ls.student_id,
        CONCAT_WS(' ', s.first_name, s.last_name) AS student_full_name,
        s.paid_lessons_left AS student_paid_lessons_left,
        DATE_FORMAT(ls.date, '%Y-%m-%d') AS date,
        TIME_FORMAT(ls.start_time, '%H:%i') AS start_time,
        CASE
          WHEN ls.status NOT IN ('completed', 'canceled', 'rescheduled')
            AND ls.date < DATE(UTC_TIMESTAMP() + INTERVAL 3 HOUR)
            THEN 'overdue'
          WHEN ls.status = 'overdue'
            AND ls.date >= DATE(UTC_TIMESTAMP() + INTERVAL 3 HOUR)
            THEN 'planned'
          ELSE ls.status
        END AS status,
        ls.rescheduled_to_slot_id,
        DATE_FORMAT(rsl.date, '%Y-%m-%d') AS reschedule_target_date,
        TIME_FORMAT(rsl.start_time, '%H:%i') AS reschedule_target_time,
        COALESCE(ls.source_weekly_slot_id, reschedule_source.inherited_source_weekly_slot_id) AS source_weekly_slot_id,
        UNIX_TIMESTAMP(ls.updated_at) AS lock_version,
        status_audit.created_at AS status_changed_at,
        actor.login AS status_changed_by_login,
        JSON_UNQUOTE(JSON_EXTRACT(status_audit.diff_after, '$.reason')) AS status_reason
      FROM lesson_slots ls
      LEFT JOIN students s ON s.id = ls.student_id
      LEFT JOIN lesson_slots rsl ON rsl.id = ls.rescheduled_to_slot_id
      LEFT JOIN (
        SELECT
          rescheduled_to_slot_id AS target_slot_id,
          MAX(source_weekly_slot_id) AS inherited_source_weekly_slot_id
        FROM lesson_slots
        WHERE rescheduled_to_slot_id IS NOT NULL
        GROUP BY rescheduled_to_slot_id
      ) reschedule_source ON reschedule_source.target_slot_id = ls.id
      LEFT JOIN audit_logs status_audit
        ON status_audit.id = (
          SELECT al.id
          FROM audit_logs al
          WHERE al.entity_type = 'lesson_slot'
            AND al.entity_id = ls.id
            AND al.action = 'status_update'
          ORDER BY al.created_at DESC, al.id DESC
          LIMIT 1
        )
      LEFT JOIN users actor ON actor.id = status_audit.actor_user_id
      WHERE ls.id = ?
      LIMIT 1
    `,
    [id]
  );

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    id: String(row.id),
    teacher_id: String(row.teacher_id),
    student_id: row.student_id ? String(row.student_id) : null,
    student_full_name: row.student_full_name ? String(row.student_full_name) : null,
    student_paid_lessons_left: row.student_paid_lessons_left !== null ? Number(row.student_paid_lessons_left) : null,
    date: String(row.date),
    start_time: String(row.start_time),
    status: String(row.status) as JournalLessonStatus,
    rescheduled_to_slot_id: row.rescheduled_to_slot_id ? String(row.rescheduled_to_slot_id) : null,
    reschedule_target_date: row.reschedule_target_date ? String(row.reschedule_target_date) : null,
    reschedule_target_time: row.reschedule_target_time ? String(row.reschedule_target_time) : null,
    source_weekly_slot_id: row.source_weekly_slot_id ? String(row.source_weekly_slot_id) : null,
    lock_version: Number(row.lock_version ?? 0),
    status_changed_by_login: row.status_changed_by_login ? String(row.status_changed_by_login) : null,
    status_changed_at: row.status_changed_at ? new Date(row.status_changed_at).toISOString() : null,
    status_reason: row.status_reason ? String(row.status_reason) : null
  };
}

async function getLessonSlotByIdForUpdate(
  connection: mysql.PoolConnection,
  id: string
): Promise<{
  id: string;
  teacher_id: string;
  student_id: string | null;
  date: string;
  start_time: string;
  status: JournalLessonStatus;
  source_weekly_slot_id: string | null;
  rescheduled_to_slot_id: string | null;
  lock_version: number;
} | null> {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `
      SELECT
        id,
        teacher_id,
        student_id,
        DATE_FORMAT(date, '%Y-%m-%d') AS date,
        TIME_FORMAT(start_time, '%H:%i') AS start_time,
        status,
        source_weekly_slot_id,
        rescheduled_to_slot_id,
        UNIX_TIMESTAMP(updated_at) AS lock_version
      FROM lesson_slots
      WHERE id = ?
      LIMIT 1
      FOR UPDATE
    `,
    [id]
  );

  if (rows.length === 0) return null;

  return {
    id: String(rows[0].id),
    teacher_id: String(rows[0].teacher_id),
    student_id: rows[0].student_id ? String(rows[0].student_id) : null,
    date: String(rows[0].date),
    start_time: String(rows[0].start_time),
    status: String(rows[0].status) as JournalLessonStatus,
    source_weekly_slot_id: rows[0].source_weekly_slot_id ? String(rows[0].source_weekly_slot_id) : null,
    rescheduled_to_slot_id: rows[0].rescheduled_to_slot_id ? String(rows[0].rescheduled_to_slot_id) : null,
    lock_version: Number(rows[0].lock_version ?? 0)
  };
}

async function assertTeacherExists(connection: mysql.PoolConnection, teacherId: string): Promise<void> {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT id FROM teachers WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [teacherId]
  );
  if (rows.length === 0) throw new Error('TEACHER_NOT_FOUND');
}

async function assertStudentBelongsToTeacher(
  connection: mysql.PoolConnection,
  teacherId: string,
  studentId: string | null
): Promise<void> {
  if (!studentId) return;

  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `
      SELECT id
      FROM students
      WHERE id = ? AND assigned_teacher_id = ? AND deleted_at IS NULL AND entity_type = 'student'
      LIMIT 1
    `,
    [studentId, teacherId]
  );
  if (rows.length === 0) throw new Error('STUDENT_NOT_ASSIGNED_TO_TEACHER');
}

async function assertStudentTimeAvailability(
  connection: mysql.PoolConnection,
  input: { studentId: string | null; date: string; startTime: string; excludeSlotId?: string }
): Promise<void> {
  if (!input.studentId) return;

  const params: Array<string> = [input.studentId, input.date, `${input.startTime}:00`];
  let sql = `
    SELECT id
    FROM lesson_slots
    WHERE student_id = ?
      AND date = ?
      AND start_time = ?
      AND status <> 'canceled'
  `;

  if (input.excludeSlotId) {
    sql += ` AND id <> ?`;
    params.push(input.excludeSlotId);
  }

  sql += ` LIMIT 1 FOR UPDATE`;

  const [rows] = await connection.query<mysql.RowDataPacket[]>(sql, params);
  if (rows.length > 0) {
    throw new Error('STUDENT_TIME_CONFLICT');
  }
}

async function assertStudentHasNoEarlierUnconfirmedSlots(
  connection: mysql.PoolConnection,
  input: { teacherId: string; studentId: string | null; beforeDate: string; beforeStartTime: string; excludeSlotId: string }
): Promise<void> {
  if (!input.studentId) return;

  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `
      SELECT id
      FROM lesson_slots
      WHERE teacher_id = ?
        AND student_id = ?
        AND status NOT IN ('completed', 'canceled')
        AND (
          date < ?
          OR (date = ? AND start_time < ?)
        )
        AND id <> ?
      LIMIT 1
      FOR UPDATE
    `,
    [input.teacherId, input.studentId, input.beforeDate, input.beforeDate, `${input.beforeStartTime}:00`, input.excludeSlotId]
  );

  if (rows.length > 0) {
    throw new Error('STUDENT_HAS_OVERDUE_SLOTS');
  }
}

async function adjustStudentPaidLessons(connection: mysql.PoolConnection, studentId: string | null, diff: number): Promise<void> {
  if (!studentId || diff === 0) return;

  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `
      SELECT paid_lessons_left
      FROM students
      WHERE id = ? AND deleted_at IS NULL
      LIMIT 1
      FOR UPDATE
    `,
    [studentId]
  );

  if (rows.length === 0) throw new Error('STUDENT_NOT_FOUND');
  const current = Number(rows[0].paid_lessons_left ?? 0);
  const next = current + diff;
  if (next < 0) throw new Error('STUDENT_BALANCE_EMPTY');

  await connection.query(`UPDATE students SET paid_lessons_left = ? WHERE id = ?`, [next, studentId]);
}

async function markOverduePlannedSlots(
  connection: mysql.PoolConnection,
  input: { teacherId?: string; slotId?: string }
): Promise<void> {
  if (!input.teacherId && !input.slotId) return;

  const whereParts: string[] = [];
  const params: Array<string> = [];

  if (input.teacherId) {
    whereParts.push('teacher_id = ?');
    params.push(input.teacherId);
  }
  if (input.slotId) {
    whereParts.push('id = ?');
    params.push(input.slotId);
  }

  await connection.query(
    `
      UPDATE lesson_slots
      SET status = 'planned'
      WHERE status = 'overdue'
        AND date >= DATE(UTC_TIMESTAMP() + INTERVAL 3 HOUR)
        ${whereParts.length > 0 ? `AND ${whereParts.join(' AND ')}` : ''}
    `,
    params
  );

  await connection.query(
    `
      UPDATE lesson_slots
      SET status = 'overdue'
      WHERE status NOT IN ('completed', 'canceled', 'rescheduled')
        AND date < DATE(UTC_TIMESTAMP() + INTERVAL 3 HOUR)
        ${whereParts.length > 0 ? `AND ${whereParts.join(' AND ')}` : ''}
    `,
    params
  );
}

async function upsertRescheduledTargetSlot(
  connection: mysql.PoolConnection,
  input: { teacherId: string; studentId: string | null; date: string; startTime: string }
): Promise<string> {
  await assertStudentTimeAvailability(connection, {
    studentId: input.studentId,
    date: input.date,
    startTime: input.startTime
  });

  const createdId = randomUUID();
  try {
    await connection.query(
      `
        INSERT INTO lesson_slots (id, teacher_id, student_id, date, start_time, status)
        VALUES (?, ?, ?, ?, ?, 'planned')
      `,
      [createdId, input.teacherId, input.studentId, input.date, `${input.startTime}:00`]
    );
    return createdId;
  } catch (error) {
    if (!isMysqlDuplicateError(error, 'uq_lesson_slots_teacher_datetime')) throw error;

    const [existingRows] = await connection.query<mysql.RowDataPacket[]>(
      `
        SELECT id, student_id
        FROM lesson_slots
        WHERE teacher_id = ? AND date = ? AND start_time = ?
        LIMIT 1
        FOR UPDATE
      `,
      [input.teacherId, input.date, `${input.startTime}:00`]
    );
    if (existingRows.length === 0) throw error;
    const existingId = String(existingRows[0].id);
    const existingStudentId = existingRows[0].student_id ? String(existingRows[0].student_id) : null;

    if (input.studentId && existingStudentId && existingStudentId !== input.studentId) {
      throw new Error('STUDENT_TIME_CONFLICT');
    }

    if (input.studentId && !existingStudentId) {
      await connection.query(`UPDATE lesson_slots SET student_id = ? WHERE id = ?`, [input.studentId, existingId]);
    }

    return existingId;
  }
}

async function getLessonSlotByTeacherDateTime(
  connection: mysql.PoolConnection,
  teacherId: string,
  date: string,
  startTime: string
): Promise<JournalLessonSlot | null> {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `
      SELECT id
      FROM lesson_slots
      WHERE teacher_id = ? AND date = ? AND start_time = ?
      LIMIT 1
    `,
    [teacherId, date, `${startTime}:00`]
  );

  if (rows.length === 0) return null;
  return getLessonSlotById(connection, String(rows[0].id));
}

function isMysqlDuplicateError(error: unknown, indexName: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: string; message?: string };
  return candidate.code === 'ER_DUP_ENTRY' && Boolean(candidate.message?.includes(indexName));
}

function isMysqlUnknownColumnError(error: unknown, columnName: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: string; message?: string };
  return candidate.code === 'ER_BAD_FIELD_ERROR' && Boolean(candidate.message?.includes(columnName));
}

function assertTeacherConflictLock(
  expectedLockVersion: number | undefined,
  currentLockVersion: number,
  actorRole: 'admin' | 'teacher'
): void {
  if (typeof expectedLockVersion !== 'number') return;
  if (expectedLockVersion === currentLockVersion) return;
  if (actorRole === 'admin') return;
  throw new Error('SLOT_CONFLICT_ADMIN_WON');
}

async function hasTeacherWeeklySlotStudentIdColumn(connection: mysql.PoolConnection): Promise<boolean> {
  if (hasWeeklySlotStudentIdColumnCache !== null) return hasWeeklySlotStudentIdColumnCache;
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'teacher_weekly_slots'
        AND COLUMN_NAME = 'student_id'
      LIMIT 1
    `
  );
  hasWeeklySlotStudentIdColumnCache = rows.length > 0;
  return hasWeeklySlotStudentIdColumnCache;
}

async function hasTeacherWeeklySlotStartFromColumn(connection: mysql.PoolConnection): Promise<boolean> {
  if (hasWeeklySlotStartFromColumnCache !== null) return hasWeeklySlotStartFromColumnCache;
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'teacher_weekly_slots'
        AND COLUMN_NAME = 'start_from'
      LIMIT 1
    `
  );
  hasWeeklySlotStartFromColumnCache = rows.length > 0;
  return hasWeeklySlotStartFromColumnCache;
}

function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split('-').map((item) => Number(item));
  return new Date(Date.UTC(year, month - 1, day));
}

function formatIsoDate(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCurrentMskIsoDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
}

function* iterateDatesInclusive(start: Date, end: Date): Generator<Date> {
  const cursor = new Date(start.getTime());
  while (cursor.getTime() <= end.getTime()) {
    yield new Date(cursor.getTime());
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

function isoWeekday(date: Date): number {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

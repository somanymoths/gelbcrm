import mysql from 'mysql2/promise';
import { randomUUID } from 'crypto';
import { getMysqlConfig } from '@/lib/env';
import { deriveTelegramNormalized } from '@/lib/teachers';

const globalForDb = globalThis as unknown as { pool?: mysql.Pool };

function getPool(): mysql.Pool {
  if (!globalForDb.pool) {
    const config = getMysqlConfig();

    globalForDb.pool = mysql.createPool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      connectionLimit: 10,
      connectTimeout: 15000,
      charset: 'utf8mb4'
    });
  }
  return globalForDb.pool;
}

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
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
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
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
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
  isActive?: boolean;
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

  if (typeof input.isActive === 'boolean') {
    updates.push('is_active = ?');
    values.push(input.isActive ? 1 : 0);
  }

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

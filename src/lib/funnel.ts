import mysql from 'mysql2/promise';
import { randomUUID } from 'crypto';
import { getMysqlPool } from '@/lib/mysql-pool';
import { invalidateFunnelCardCache } from '@/lib/funnel-cache';

function getPool(): mysql.Pool {
  return getMysqlPool();
}

const LOSS_STAGE_CODES = new Set(['declined', 'stopped']);
const SUCCESS_STAGE_CODES = new Set(['on_lessons', 'last_lesson']);

export type FunnelStageItem = {
  id: number;
  code: string;
  name: string;
  sort_order: number;
};

export type FunnelCardListItem = {
  id: string;
  entity_type: 'lead' | 'student';
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  contact_link: string | null;
  lead_source: string | null;
  card_comment: string | null;
  assigned_teacher_id: string | null;
  teacher_full_name: string | null;
  stage_id: number;
  stage_code: string;
  stage_name: string;
  next_lesson_at: string | null;
  start_lessons_at: string | null;
  last_lesson_at: string | null;
  paid_lessons_left: number;
  created_at: string;
  updated_at: string;
};

export type FunnelCardDetails = FunnelCardListItem & {
  deleted_at: string | null;
};

export type FunnelLossReason = {
  id: number;
  name: string;
};

export type FunnelComment = {
  id: number;
  student_id: string;
  stage_id: number | null;
  stage_name: string | null;
  body: string;
  author_id: string;
  author_login: string | null;
  created_at: string;
  updated_at: string;
};

export type FunnelAuditItem = {
  id: number;
  actor_user_id: string | null;
  actor_login: string | null;
  action: string;
  diff_before: Record<string, unknown> | null;
  diff_after: Record<string, unknown> | null;
  created_at: string;
};

export type FunnelPaymentTariff = {
  id: string;
  name: string;
  packages: Array<{
    id: string;
    lessons_count: number;
    price_per_lesson_rub: number;
    total_price_rub: number;
  }>;
};

export type TariffPackageForPayment = {
  id: string;
  tariff_grid_id: string;
  tariff_name: string;
  lessons_count: number;
  total_price_rub: number;
};

export type FunnelPaymentLink = {
  id: string;
  provider: string;
  provider_payment_id: string;
  payment_url: string;
  status: 'pending' | 'paid' | 'failed' | 'expired';
  amount: number;
  currency: string;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
};

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

function toNullableDate(input?: string | null): string | null {
  if (!input) return null;
  return input;
}

function parseJsonColumn(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value !== 'string') return null;

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

function toMysqlTimestamp(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

export async function listFunnelStages(): Promise<FunnelStageItem[]> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT id, code, name, sort_order
      FROM funnel_stages
      ORDER BY sort_order ASC
    `
  );

  return rows as FunnelStageItem[];
}

export async function listFunnelBoardCards(): Promise<FunnelCardListItem[]> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT
        s.id,
        s.entity_type,
        s.first_name,
        s.last_name,
        CONCAT_WS(' ', s.first_name, s.last_name) AS full_name,
        s.phone,
        s.email,
        s.contact_link,
        s.lead_source,
        s.card_comment,
        s.assigned_teacher_id,
        CONCAT_WS(' ', t.first_name, t.last_name) AS teacher_full_name,
        fs.id AS stage_id,
        fs.code AS stage_code,
        fs.name AS stage_name,
        s.next_lesson_at,
        s.start_lessons_at,
        s.last_lesson_at,
        s.paid_lessons_left,
        s.created_at,
        s.updated_at
      FROM students s
      INNER JOIN funnel_stages fs ON fs.id = s.current_funnel_stage_id
      LEFT JOIN teachers t ON t.id = s.assigned_teacher_id
      WHERE s.deleted_at IS NULL
      ORDER BY fs.sort_order ASC, s.created_at DESC
    `
  );

  const items = rows as unknown as FunnelCardListItem[];
  const grouped = new Map<string, FunnelCardListItem[]>();

  for (const item of items) {
    const bucket = grouped.get(item.stage_code);
    if (bucket) {
      bucket.push(item);
      continue;
    }

    grouped.set(item.stage_code, [item]);
  }

  const result: FunnelCardListItem[] = [];

  for (const stageItems of grouped.values()) {
    stageItems.sort((a, b) => {
      if (a.next_lesson_at && b.next_lesson_at) {
        return new Date(a.next_lesson_at).getTime() - new Date(b.next_lesson_at).getTime();
      }

      if (a.next_lesson_at && !b.next_lesson_at) return -1;
      if (!a.next_lesson_at && b.next_lesson_at) return 1;

      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    result.push(...stageItems);
  }

  return result;
}

export async function createFunnelCard(input: {
  firstName: string;
  lastName: string;
  phone?: string | null;
  contact?: string | null;
  email?: string | null;
  leadSource?: string | null;
  comment?: string | null;
  startLessonsAt?: string | null;
  lastLessonAt?: string | null;
  paidLessonsLeft?: number;
  actorUserId: string;
}): Promise<FunnelCardDetails> {
  const connection = await getPool().getConnection();
  const id = randomUUID();

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
          entity_type,
          first_name,
          last_name,
          contact_link,
          phone,
          email,
          lead_source,
          card_comment,
          start_lessons_at,
          last_lesson_at,
          paid_lessons_left,
          current_funnel_stage_id
        )
        VALUES (?, 'lead', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        input.firstName,
        input.lastName,
        input.contact ?? null,
        input.phone ?? null,
        input.email ?? null,
        input.leadSource ?? null,
        input.comment ?? null,
        toNullableDate(input.startLessonsAt),
        toNullableDate(input.lastLessonAt),
        input.paidLessonsLeft ?? 0,
        stageId
      ]
    );

    await connection.query(
      `
        INSERT INTO funnel_stage_history (student_id, old_stage_id, new_stage_id, changed_by)
        VALUES (?, NULL, ?, ?)
      `,
      [id, stageId, input.actorUserId]
    );

    await writeAuditLog(connection, {
      actorUserId: input.actorUserId,
      entityType: 'student',
      entityId: id,
      action: 'create',
      diffAfter: {
        first_name: input.firstName,
        last_name: input.lastName,
        phone: input.phone ?? null,
        email: input.email ?? null,
        stage_code: 'interested'
      }
    });

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const created = await getFunnelCardById({ cardId: id, includeArchived: true });
  if (!created) throw new Error('STUDENT_NOT_FOUND');

  return created;
}

export async function getFunnelCardById(input: {
  cardId: string;
  includeArchived?: boolean;
}): Promise<FunnelCardDetails | null> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT
        s.id,
        s.entity_type,
        s.first_name,
        s.last_name,
        CONCAT_WS(' ', s.first_name, s.last_name) AS full_name,
        s.phone,
        s.email,
        s.contact_link,
        s.lead_source,
        s.card_comment,
        s.assigned_teacher_id,
        CONCAT_WS(' ', t.first_name, t.last_name) AS teacher_full_name,
        fs.id AS stage_id,
        fs.code AS stage_code,
        fs.name AS stage_name,
        s.next_lesson_at,
        s.start_lessons_at,
        s.last_lesson_at,
        s.paid_lessons_left,
        s.created_at,
        s.updated_at,
        s.deleted_at
      FROM students s
      INNER JOIN funnel_stages fs ON fs.id = s.current_funnel_stage_id
      LEFT JOIN teachers t ON t.id = s.assigned_teacher_id
      WHERE s.id = ?
        AND (? = 1 OR s.deleted_at IS NULL)
      LIMIT 1
    `,
    [input.cardId, input.includeArchived ? 1 : 0]
  );

  if (rows.length === 0) return null;

  return rows[0] as unknown as FunnelCardDetails;
}

export async function updateFunnelCard(input: {
  cardId: string;
  actorUserId: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  contact?: string;
  email?: string;
  leadSource?: string;
  comment?: string | null;
  startLessonsAt?: string | null;
  lastLessonAt?: string | null;
}): Promise<void> {
  const keys = Object.keys(input).filter((key) =>
    ['firstName', 'lastName', 'phone', 'contact', 'email', 'leadSource', 'comment', 'startLessonsAt', 'lastLessonAt'].includes(key)
  );

  if (keys.length === 0) return;

  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      `
        SELECT
          id,
          first_name,
          last_name,
          phone,
          email,
          contact_link,
          lead_source,
          card_comment,
          start_lessons_at,
          last_lesson_at,
          paid_lessons_left
        FROM students
        WHERE id = ? AND deleted_at IS NULL
        LIMIT 1
      `,
      [input.cardId]
    );

    if (rows.length === 0) {
      throw new Error('STUDENT_NOT_FOUND');
    }

    const current = rows[0] as Record<string, unknown>;
    const setParts: string[] = [];
    const params: Array<string | number | null> = [];
    const diffBefore: Record<string, unknown> = {};
    const diffAfter: Record<string, unknown> = {};

    if (typeof input.firstName === 'string') {
      setParts.push('first_name = ?');
      params.push(input.firstName);
      diffBefore.first_name = current.first_name;
      diffAfter.first_name = input.firstName;
    }

    if (typeof input.lastName === 'string') {
      setParts.push('last_name = ?');
      params.push(input.lastName);
      diffBefore.last_name = current.last_name;
      diffAfter.last_name = input.lastName;
    }

    if (typeof input.phone === 'string') {
      setParts.push('phone = ?');
      params.push(input.phone);
      diffBefore.phone = current.phone;
      diffAfter.phone = input.phone;
    }

    if (typeof input.email === 'string') {
      setParts.push('email = ?');
      params.push(input.email);
      diffBefore.email = current.email;
      diffAfter.email = input.email;
    }

    if (typeof input.contact === 'string') {
      setParts.push('contact_link = ?');
      params.push(input.contact);
      diffBefore.contact_link = current.contact_link;
      diffAfter.contact_link = input.contact;
    }

    if (typeof input.leadSource === 'string') {
      setParts.push('lead_source = ?');
      params.push(input.leadSource);
      diffBefore.lead_source = current.lead_source;
      diffAfter.lead_source = input.leadSource;
    }

    if (typeof input.comment === 'string' || input.comment === null) {
      setParts.push('card_comment = ?');
      params.push(input.comment ?? null);
      diffBefore.card_comment = current.card_comment;
      diffAfter.card_comment = input.comment ?? null;
    }

    if (typeof input.startLessonsAt === 'string' || input.startLessonsAt === null) {
      setParts.push('start_lessons_at = ?');
      params.push(toNullableDate(input.startLessonsAt));
      diffBefore.start_lessons_at = current.start_lessons_at;
      diffAfter.start_lessons_at = input.startLessonsAt ?? null;
    }

    if (typeof input.lastLessonAt === 'string' || input.lastLessonAt === null) {
      setParts.push('last_lesson_at = ?');
      params.push(toNullableDate(input.lastLessonAt));
      diffBefore.last_lesson_at = current.last_lesson_at;
      diffAfter.last_lesson_at = input.lastLessonAt ?? null;
    }

    if (setParts.length > 0) {
      await connection.query(`UPDATE students SET ${setParts.join(', ')} WHERE id = ?`, [...params, input.cardId]);

      await writeAuditLog(connection, {
        actorUserId: input.actorUserId,
        entityType: 'student',
        entityId: input.cardId,
        action: 'update',
        diffBefore,
        diffAfter
      });
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function addFunnelCardManualLessons(input: {
  cardId: string;
  lessonsToAdd: number;
  comment: string;
  actorUserId: string;
}): Promise<number> {
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      `
        SELECT id, paid_lessons_left
        FROM students
        WHERE id = ? AND deleted_at IS NULL
        LIMIT 1
        FOR UPDATE
      `,
      [input.cardId]
    );

    if (rows.length === 0) {
      throw new Error('STUDENT_NOT_FOUND');
    }

    const currentPaidLessons = Number(rows[0].paid_lessons_left ?? 0);
    const nextPaidLessons = currentPaidLessons + input.lessonsToAdd;

    await connection.query(`UPDATE students SET paid_lessons_left = ? WHERE id = ?`, [nextPaidLessons, input.cardId]);

    await writeAuditLog(connection, {
      actorUserId: input.actorUserId,
      entityType: 'student',
      entityId: input.cardId,
      action: 'manual_lessons_add',
      diffBefore: { paid_lessons_left: currentPaidLessons },
      diffAfter: {
        paid_lessons_left: nextPaidLessons,
        lessons_added: input.lessonsToAdd,
        comment: input.comment
      }
    });

    await connection.commit();
    return nextPaidLessons;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateFunnelCardStage(input: {
  cardId: string;
  stageCode: string;
  actorUserId: string;
  lossReasonId?: number;
}): Promise<void> {
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();

    const [studentRows] = await connection.query<mysql.RowDataPacket[]>(
      `
        SELECT s.id, s.entity_type, s.current_funnel_stage_id, fs.code AS stage_code
        FROM students s
        INNER JOIN funnel_stages fs ON fs.id = s.current_funnel_stage_id
        WHERE s.id = ? AND s.deleted_at IS NULL
        LIMIT 1
      `,
      [input.cardId]
    );

    if (studentRows.length === 0) {
      throw new Error('STUDENT_NOT_FOUND');
    }

    const student = studentRows[0] as {
      entity_type: 'lead' | 'student';
      current_funnel_stage_id: number;
      stage_code: string;
    };

    const [nextStageRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT id, code FROM funnel_stages WHERE code = ? LIMIT 1`,
      [input.stageCode]
    );

    if (nextStageRows.length === 0) {
      throw new Error('FUNNEL_STAGE_NOT_FOUND');
    }

    const nextStageId = Number(nextStageRows[0].id);
    const nextStageCode = String(nextStageRows[0].code);

    if (student.current_funnel_stage_id === nextStageId) {
      await connection.rollback();
      return;
    }

    if (LOSS_STAGE_CODES.has(nextStageCode)) {
      if (!input.lossReasonId) {
        throw new Error('LOSS_REASON_REQUIRED');
      }

      const [reasonRows] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT id FROM funnel_loss_reasons WHERE id = ? AND is_active = 1 LIMIT 1`,
        [input.lossReasonId]
      );

      if (reasonRows.length === 0) {
        throw new Error('LOSS_REASON_NOT_FOUND');
      }
    }

    const nextEntityType = SUCCESS_STAGE_CODES.has(nextStageCode) ? 'student' : student.entity_type;

    await connection.query(
      `
        UPDATE students
        SET current_funnel_stage_id = ?, entity_type = ?
        WHERE id = ?
      `,
      [nextStageId, nextEntityType, input.cardId]
    );

    await connection.query(
      `
        INSERT INTO funnel_stage_history (student_id, old_stage_id, new_stage_id, changed_by)
        VALUES (?, ?, ?, ?)
      `,
      [input.cardId, student.current_funnel_stage_id, nextStageId, input.actorUserId]
    );

    if (LOSS_STAGE_CODES.has(nextStageCode) && input.lossReasonId) {
      await connection.query(
        `
          INSERT INTO funnel_loss_events (student_id, stage_id, reason_id, created_by)
          VALUES (?, ?, ?, ?)
        `,
        [input.cardId, nextStageId, input.lossReasonId, input.actorUserId]
      );
    }

    await writeAuditLog(connection, {
      actorUserId: input.actorUserId,
      entityType: 'student',
      entityId: input.cardId,
      action: 'update_stage',
      diffBefore: {
        stage_code: student.stage_code,
        entity_type: student.entity_type
      },
      diffAfter: {
        stage_code: nextStageCode,
        entity_type: nextEntityType,
        loss_reason_id: input.lossReasonId ?? null
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

export async function assignTeacherToFunnelCard(input: {
  cardId: string;
  teacherId: string | null;
  actorUserId: string;
}): Promise<void> {
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();

    const [studentRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT id, assigned_teacher_id FROM students WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [input.cardId]
    );

    if (studentRows.length === 0) {
      throw new Error('STUDENT_NOT_FOUND');
    }

    const oldTeacherId = studentRows[0].assigned_teacher_id ? String(studentRows[0].assigned_teacher_id) : null;
    const nextTeacherId = input.teacherId ?? null;

    if (oldTeacherId === nextTeacherId) {
      await connection.commit();
      return;
    }

    if (nextTeacherId) {
      const [teacherRows] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT id FROM teachers WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
        [nextTeacherId]
      );

      if (teacherRows.length === 0) {
        throw new Error('TEACHER_NOT_FOUND');
      }
    }

    await connection.query(`UPDATE students SET assigned_teacher_id = ? WHERE id = ?`, [nextTeacherId, input.cardId]);

    await connection.query(
      `
        INSERT INTO student_teacher_history (student_id, old_teacher_id, new_teacher_id, changed_by)
        VALUES (?, ?, ?, ?)
      `,
      [input.cardId, oldTeacherId, nextTeacherId, input.actorUserId]
    );

    await writeAuditLog(connection, {
      actorUserId: input.actorUserId,
      entityType: 'student',
      entityId: input.cardId,
      action: 'assign_teacher',
      diffBefore: { assigned_teacher_id: oldTeacherId },
      diffAfter: { assigned_teacher_id: nextTeacherId }
    });

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function archiveFunnelCard(input: { cardId: string; actorUserId: string }): Promise<void> {
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT id FROM students WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [input.cardId]
    );

    if (rows.length === 0) throw new Error('STUDENT_NOT_FOUND');

    await connection.query(
      `
        UPDATE students
        SET deleted_at = CURRENT_TIMESTAMP, archived_by = ?
        WHERE id = ?
      `,
      [input.actorUserId, input.cardId]
    );

    await writeAuditLog(connection, {
      actorUserId: input.actorUserId,
      entityType: 'student',
      entityId: input.cardId,
      action: 'archive'
    });

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function restoreFunnelCard(input: {
  cardId: string;
  stageCode: string;
  actorUserId: string;
}): Promise<void> {
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();

    const [studentRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT id, deleted_at, current_funnel_stage_id FROM students WHERE id = ? LIMIT 1`,
      [input.cardId]
    );

    if (studentRows.length === 0) throw new Error('STUDENT_NOT_FOUND');
    if (!studentRows[0].deleted_at) throw new Error('STUDENT_NOT_ARCHIVED');

    const [stageRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT id, code FROM funnel_stages WHERE code = ? LIMIT 1`,
      [input.stageCode]
    );

    if (stageRows.length === 0) {
      throw new Error('FUNNEL_STAGE_NOT_FOUND');
    }

    const stageId = Number(stageRows[0].id);

    await connection.query(
      `
        UPDATE students
        SET deleted_at = NULL, archived_by = NULL, current_funnel_stage_id = ?
        WHERE id = ?
      `,
      [stageId, input.cardId]
    );

    await connection.query(
      `
        INSERT INTO funnel_stage_history (student_id, old_stage_id, new_stage_id, changed_by)
        VALUES (?, ?, ?, ?)
      `,
      [input.cardId, Number(studentRows[0].current_funnel_stage_id), stageId, input.actorUserId]
    );

    await writeAuditLog(connection, {
      actorUserId: input.actorUserId,
      entityType: 'student',
      entityId: input.cardId,
      action: 'restore',
      diffAfter: { stage_code: stageRows[0].code }
    });

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listArchivedFunnelCards(): Promise<FunnelCardListItem[]> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT
        s.id,
        s.entity_type,
        s.first_name,
        s.last_name,
        CONCAT_WS(' ', s.first_name, s.last_name) AS full_name,
        s.phone,
        s.email,
        s.contact_link,
        s.lead_source,
        s.card_comment,
        s.assigned_teacher_id,
        CONCAT_WS(' ', t.first_name, t.last_name) AS teacher_full_name,
        fs.id AS stage_id,
        fs.code AS stage_code,
        fs.name AS stage_name,
        s.next_lesson_at,
        s.start_lessons_at,
        s.last_lesson_at,
        s.paid_lessons_left,
        s.created_at,
        s.updated_at
      FROM students s
      INNER JOIN funnel_stages fs ON fs.id = s.current_funnel_stage_id
      LEFT JOIN teachers t ON t.id = s.assigned_teacher_id
      WHERE s.deleted_at IS NOT NULL
      ORDER BY s.deleted_at DESC
    `
  );

  return rows as unknown as FunnelCardListItem[];
}

export async function listLossReasons(): Promise<FunnelLossReason[]> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT id, name
      FROM funnel_loss_reasons
      WHERE is_active = 1
      ORDER BY name ASC
    `
  );

  return rows as FunnelLossReason[];
}

export async function listCardComments(input: { cardId: string }): Promise<FunnelComment[]> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT
        c.id,
        c.student_id,
        c.stage_id,
        fs.name AS stage_name,
        c.body,
        c.author_id,
        u.login AS author_login,
        c.created_at,
        c.updated_at
      FROM student_comments c
      LEFT JOIN funnel_stages fs ON fs.id = c.stage_id
      LEFT JOIN users u ON u.id = c.author_id
      WHERE c.student_id = ?
      ORDER BY c.created_at DESC
    `,
    [input.cardId]
  );

  return rows as FunnelComment[];
}

export async function addCardComment(input: {
  cardId: string;
  stageId?: number | null;
  body: string;
  authorId: string;
}): Promise<void> {
  const [studentRows] = await getPool().query<mysql.RowDataPacket[]>(
    `SELECT id FROM students WHERE id = ? LIMIT 1`,
    [input.cardId]
  );

  if (studentRows.length === 0) {
    throw new Error('STUDENT_NOT_FOUND');
  }

  if (typeof input.stageId === 'number') {
    const [stageRows] = await getPool().query<mysql.RowDataPacket[]>(
      `SELECT id FROM funnel_stages WHERE id = ? LIMIT 1`,
      [input.stageId]
    );

    if (stageRows.length === 0) {
      throw new Error('FUNNEL_STAGE_NOT_FOUND');
    }
  }

  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();

    await connection.query(
      `
        INSERT INTO student_comments (student_id, stage_id, body, author_id)
        VALUES (?, ?, ?, ?)
      `,
      [input.cardId, input.stageId ?? null, input.body, input.authorId]
    );

    await writeAuditLog(connection, {
      actorUserId: input.authorId,
      entityType: 'student',
      entityId: input.cardId,
      action: 'add_comment',
      diffAfter: { stage_id: input.stageId ?? null, body: input.body }
    });

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listCardAudit(input: { cardId: string }): Promise<FunnelAuditItem[]> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT
        a.id,
        a.actor_user_id,
        u.login AS actor_login,
        a.action,
        a.diff_before,
        a.diff_after,
        a.created_at
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.actor_user_id
      WHERE a.entity_type = 'student' AND a.entity_id = ?
      ORDER BY a.created_at DESC, a.id DESC
    `,
    [input.cardId]
  );

  return rows.map((row) => ({
    id: Number(row.id),
    actor_user_id: row.actor_user_id ? String(row.actor_user_id) : null,
    actor_login: row.actor_login ? String(row.actor_login) : null,
    action: String(row.action),
    diff_before: parseJsonColumn(row.diff_before),
    diff_after: parseJsonColumn(row.diff_after),
    created_at: String(row.created_at)
  }));
}

export async function getStageCountsReport(): Promise<Array<{ stage_code: string; stage_name: string; count: number }>> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT fs.code AS stage_code, fs.name AS stage_name, COUNT(s.id) AS count
      FROM funnel_stages fs
      LEFT JOIN students s
        ON s.current_funnel_stage_id = fs.id
       AND s.deleted_at IS NULL
      GROUP BY fs.id, fs.code, fs.name
      ORDER BY fs.sort_order ASC
    `
  );

  return rows.map((row) => ({
    stage_code: String(row.stage_code),
    stage_name: String(row.stage_name),
    count: Number(row.count ?? 0)
  }));
}

export async function getLossesCurrentReport(): Promise<{
  declined: number;
  stopped: number;
  total: number;
}> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT fs.code AS stage_code, COUNT(s.id) AS count
      FROM funnel_stages fs
      LEFT JOIN students s
        ON s.current_funnel_stage_id = fs.id
       AND s.deleted_at IS NULL
      WHERE fs.code IN ('declined', 'stopped')
      GROUP BY fs.code
    `
  );

  let declined = 0;
  let stopped = 0;

  for (const row of rows) {
    if (row.stage_code === 'declined') declined = Number(row.count ?? 0);
    if (row.stage_code === 'stopped') stopped = Number(row.count ?? 0);
  }

  return {
    declined,
    stopped,
    total: declined + stopped
  };
}

export async function listPaymentTariffs(): Promise<FunnelPaymentTariff[]> {
  const [gridRows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT id, name
      FROM tariff_grids
      WHERE is_active = 1
      ORDER BY created_at DESC
    `
  );

  if (gridRows.length === 0) return [];

  const ids = gridRows.map((row) => String(row.id));
  const placeholders = ids.map(() => '?').join(', ');

  const [packageRows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT id, tariff_grid_id, lessons_count, price_per_lesson_rub, total_price_rub
      FROM tariff_packages
      WHERE is_active = 1 AND tariff_grid_id IN (${placeholders})
      ORDER BY lessons_count ASC, total_price_rub ASC
    `,
    ids
  );

  const packageMap = new Map<string, FunnelPaymentTariff['packages']>();

  for (const row of packageRows) {
    const key = String(row.tariff_grid_id);
    const list = packageMap.get(key) ?? [];

    list.push({
      id: String(row.id),
      lessons_count: Number(row.lessons_count),
      price_per_lesson_rub: Number(row.price_per_lesson_rub),
      total_price_rub: Number(row.total_price_rub)
    });

    packageMap.set(key, list);
  }

  return gridRows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    packages: packageMap.get(String(row.id)) ?? []
  }));
}

export async function getTariffPackageForPayment(input: {
  tariffPackageId: string;
}): Promise<TariffPackageForPayment | null> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT
        tp.id,
        tp.tariff_grid_id,
        tg.name AS tariff_name,
        tp.lessons_count,
        tp.total_price_rub
      FROM tariff_packages tp
      INNER JOIN tariff_grids tg ON tg.id = tp.tariff_grid_id
      WHERE tp.id = ? AND tp.is_active = 1 AND tg.is_active = 1
      LIMIT 1
    `,
    [input.tariffPackageId]
  );

  if (rows.length === 0) return null;

  return {
    id: String(rows[0].id),
    tariff_grid_id: String(rows[0].tariff_grid_id),
    tariff_name: String(rows[0].tariff_name),
    lessons_count: Number(rows[0].lessons_count),
    total_price_rub: Number(rows[0].total_price_rub)
  };
}

export async function createCardPaymentLinkRecord(input: {
  cardId: string;
  tariffPackageId: string;
  actorUserId: string;
  linkId?: string;
  providerPaymentId: string;
  paymentUrl: string;
  amount: number;
  currency: string;
  expiresAt?: string | null;
}): Promise<string> {
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();

    const [studentRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT id FROM students WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [input.cardId]
    );

    if (studentRows.length === 0) {
      throw new Error('STUDENT_NOT_FOUND');
    }

    const [packageRows] = await connection.query<mysql.RowDataPacket[]>(
      `
        SELECT id, tariff_grid_id
        FROM tariff_packages
        WHERE id = ? AND is_active = 1
        LIMIT 1
      `,
      [input.tariffPackageId]
    );

    if (packageRows.length === 0) {
      throw new Error('TARIFF_PACKAGE_NOT_FOUND');
    }

    const tariffGridId = String(packageRows[0].tariff_grid_id);
    const linkId = input.linkId ?? randomUUID();

    await connection.query(
      `
        INSERT INTO student_payment_links (
          id,
          student_id,
          tariff_grid_id,
          tariff_package_id,
          provider,
          provider_payment_id,
          payment_url,
          status,
          amount,
          currency,
          expires_at,
          created_by
        )
        VALUES (?, ?, ?, ?, 'yookassa', ?, ?, 'pending', ?, ?, ?, ?)
      `,
      [
        linkId,
        input.cardId,
        tariffGridId,
        input.tariffPackageId,
        input.providerPaymentId,
        input.paymentUrl,
        input.amount,
        input.currency,
        toMysqlTimestamp(input.expiresAt),
        input.actorUserId
      ]
    );

    await writeAuditLog(connection, {
      actorUserId: input.actorUserId,
      entityType: 'student',
      entityId: input.cardId,
      action: 'payment_link_create',
      diffAfter: {
        provider_payment_id: input.providerPaymentId,
        amount: input.amount,
        currency: input.currency,
        status: 'pending'
      }
    });

    await connection.commit();
    return linkId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listCardPaymentLinks(input: { cardId: string }): Promise<FunnelPaymentLink[]> {
  await getPool().query(
    `
      UPDATE student_payment_links
      SET status = 'expired'
      WHERE student_id = ?
        AND status = 'pending'
        AND expires_at IS NOT NULL
        AND expires_at <= NOW()
    `,
    [input.cardId]
  );

  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT
        id,
        provider,
        provider_payment_id,
        payment_url,
        status,
        amount,
        currency,
        created_at,
        updated_at,
        expires_at
      FROM student_payment_links
      WHERE student_id = ?
      ORDER BY created_at DESC
    `,
    [input.cardId]
  );

  return rows.map((row) => ({
    id: String(row.id),
    provider: String(row.provider),
    provider_payment_id: String(row.provider_payment_id),
    payment_url: String(row.payment_url),
    status: String(row.status) as FunnelPaymentLink['status'],
    amount: Number(row.amount),
    currency: String(row.currency),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    expires_at: row.expires_at ? String(row.expires_at) : null
  }));
}

export async function getActiveCardPaymentLink(input: { cardId: string }): Promise<FunnelPaymentLink | null> {
  await getPool().query(
    `
      UPDATE student_payment_links
      SET status = 'expired'
      WHERE student_id = ?
        AND status = 'pending'
        AND expires_at IS NOT NULL
        AND expires_at <= NOW()
    `,
    [input.cardId]
  );

  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT
        id,
        provider,
        provider_payment_id,
        payment_url,
        status,
        amount,
        currency,
        created_at,
        updated_at,
        expires_at
      FROM student_payment_links
      WHERE student_id = ?
        AND status = 'pending'
        AND expires_at IS NOT NULL
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [input.cardId]
  );

  if (rows.length === 0) return null;

  return {
    id: String(rows[0].id),
    provider: String(rows[0].provider),
    provider_payment_id: String(rows[0].provider_payment_id),
    payment_url: String(rows[0].payment_url),
    status: String(rows[0].status) as FunnelPaymentLink['status'],
    amount: Number(rows[0].amount),
    currency: String(rows[0].currency),
    created_at: String(rows[0].created_at),
    updated_at: String(rows[0].updated_at),
    expires_at: rows[0].expires_at ? String(rows[0].expires_at) : null
  };
}

export async function getActiveCardPaymentLinkForRefresh(input: {
  cardId: string;
}): Promise<{ linkId: string; tariffPackage: TariffPackageForPayment } | null> {
  await getPool().query(
    `
      UPDATE student_payment_links
      SET status = 'expired'
      WHERE student_id = ?
        AND status = 'pending'
        AND expires_at IS NOT NULL
        AND expires_at <= NOW()
    `,
    [input.cardId]
  );

  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT
        spl.id AS link_id,
        tp.id AS tariff_package_id,
        tp.tariff_grid_id,
        tg.name AS tariff_name,
        tp.lessons_count,
        tp.total_price_rub
      FROM student_payment_links spl
      INNER JOIN tariff_packages tp ON tp.id = spl.tariff_package_id
      INNER JOIN tariff_grids tg ON tg.id = tp.tariff_grid_id
      WHERE spl.student_id = ?
        AND spl.status = 'pending'
        AND spl.expires_at IS NOT NULL
        AND spl.expires_at > NOW()
        AND tp.is_active = 1
        AND tg.is_active = 1
      ORDER BY spl.created_at DESC
      LIMIT 1
    `,
    [input.cardId]
  );

  if (rows.length === 0) return null;

  return {
    linkId: String(rows[0].link_id),
    tariffPackage: {
      id: String(rows[0].tariff_package_id),
      tariff_grid_id: String(rows[0].tariff_grid_id),
      tariff_name: String(rows[0].tariff_name),
      lessons_count: Number(rows[0].lessons_count),
      total_price_rub: Number(rows[0].total_price_rub)
    }
  };
}

export async function expireCardPaymentLink(input: { cardId: string; linkId: string }): Promise<void> {
  await getPool().query(
    `
      UPDATE student_payment_links
      SET status = 'expired', expires_at = NOW()
      WHERE id = ? AND student_id = ?
    `,
    [input.linkId, input.cardId]
  );
}

export async function deleteActiveCardPaymentLink(input: { cardId: string; actorUserId: string }): Promise<void> {
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();

    await connection.query(
      `
        UPDATE student_payment_links
        SET status = 'expired'
        WHERE student_id = ?
          AND status = 'pending'
          AND expires_at IS NOT NULL
          AND expires_at <= NOW()
      `,
      [input.cardId]
    );

    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      `
        SELECT id, provider_payment_id
        FROM student_payment_links
        WHERE student_id = ?
          AND status = 'pending'
          AND expires_at IS NOT NULL
          AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [input.cardId]
    );

    if (rows.length === 0) {
      throw new Error('ACTIVE_PAYMENT_LINK_NOT_FOUND');
    }

    const linkId = String(rows[0].id);
    const providerPaymentId = String(rows[0].provider_payment_id);

    await connection.query(
      `
        UPDATE student_payment_links
        SET status = 'expired', expires_at = NOW()
        WHERE id = ? AND student_id = ?
      `,
      [linkId, input.cardId]
    );

    await writeAuditLog(connection, {
      actorUserId: input.actorUserId,
      entityType: 'student',
      entityId: input.cardId,
      action: 'payment_link_delete',
      diffAfter: { link_id: linkId, provider_payment_id: providerPaymentId }
    });

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function mapYookassaStatusToCardStatus(status: string): FunnelPaymentLink['status'] {
  if (status === 'succeeded') return 'paid';
  if (status === 'canceled' || status === 'failed') return 'failed';
  return 'pending';
}

export async function syncCardPaymentStatusByProviderPaymentId(input: {
  providerPaymentId: string;
  providerStatus: string;
  lessonsCount?: number | null;
}): Promise<void> {
  await syncCardPaymentStatus({
    providerStatus: input.providerStatus,
    lessonsCount: input.lessonsCount ?? null,
    providerPaymentId: input.providerPaymentId
  });
}

export async function findPendingPaymentLinkIdByFallback(input: {
  payerEmail: string;
  tariffPackageId: string;
  amount: number;
}): Promise<string | null> {
  const email = input.payerEmail.trim().toLowerCase();
  const tariffPackageId = input.tariffPackageId.trim();
  const amount = Number(input.amount);

  if (!email || !tariffPackageId || !Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT spl.id
      FROM student_payment_links spl
      INNER JOIN students s ON s.id = spl.student_id
      WHERE spl.status = 'pending'
        AND spl.tariff_package_id = ?
        AND spl.amount = ?
        AND s.email IS NOT NULL
        AND LOWER(TRIM(s.email)) = ?
      ORDER BY spl.created_at DESC
      LIMIT 2
    `,
    [tariffPackageId, amount, email]
  );

  if (rows.length !== 1) return null;
  return String(rows[0].id);
}

export async function syncCardPaymentStatusByLinkId(input: {
  paymentLinkId: string;
  providerPaymentId: string;
  providerStatus: string;
  lessonsCount?: number | null;
}): Promise<void> {
  await syncCardPaymentStatus({
    paymentLinkId: input.paymentLinkId,
    providerPaymentId: input.providerPaymentId,
    providerStatus: input.providerStatus,
    lessonsCount: input.lessonsCount ?? null
  });
}

async function syncCardPaymentStatus(input: {
  providerStatus: string;
  lessonsCount?: number | null;
  providerPaymentId?: string;
  paymentLinkId?: string;
}): Promise<void> {
  if (!input.providerPaymentId && !input.paymentLinkId) return;

  const nextStatus = mapYookassaStatusToCardStatus(input.providerStatus);
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();
    const whereSql = input.paymentLinkId ? 'spl.id = ?' : 'spl.provider_payment_id = ?';
    const params = [input.paymentLinkId ?? input.providerPaymentId];
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      `
        SELECT
          spl.id,
          spl.student_id,
          spl.status,
          spl.provider_payment_id,
          tp.lessons_count
        FROM student_payment_links spl
        LEFT JOIN tariff_packages tp ON tp.id = spl.tariff_package_id
        WHERE ${whereSql}
        FOR UPDATE
      `,
      params
    );

    if (rows.length === 0) {
      await connection.commit();
      return;
    }

    const affectedCardIds = new Set<string>();

    for (const row of rows) {
      const linkId = String(row.id);
      const studentId = String(row.student_id);
      const currentStatus = String(row.status) as FunnelPaymentLink['status'];
      const finalStatus = currentStatus === 'paid' ? 'paid' : nextStatus;
      const nextProviderPaymentId = input.providerPaymentId ?? String(row.provider_payment_id);
      const shouldApplyPaidLessons = nextStatus === 'paid' && currentStatus !== 'paid';
      const lessonsFromLink = Number(row.lessons_count ?? 0);
      const lessonsCountInput = typeof input.lessonsCount === 'number' ? input.lessonsCount : null;
      const lessonsToAdd = Number.isFinite(lessonsCountInput) && (lessonsCountInput ?? 0) > 0
        ? Math.trunc(lessonsCountInput as number)
        : Math.max(0, lessonsFromLink);

      if (shouldApplyPaidLessons && lessonsToAdd > 0) {
        await connection.query(
          `
            UPDATE students
            SET paid_lessons_left = paid_lessons_left + ?
            WHERE id = ?
          `,
          [lessonsToAdd, studentId]
        );
      }

      await connection.query(
        `
          UPDATE student_payment_links
          SET status = ?, provider_payment_id = ?
          WHERE id = ?
        `,
        [finalStatus, nextProviderPaymentId, linkId]
      );

      affectedCardIds.add(studentId);
    }

    await connection.commit();
    for (const cardId of affectedCardIds) {
      invalidateFunnelCardCache(cardId);
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listActiveTeachersBasic(): Promise<Array<{ id: string; full_name: string }>> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT id, CONCAT_WS(' ', first_name, last_name) AS full_name
      FROM teachers
      WHERE deleted_at IS NULL
      ORDER BY last_name ASC, first_name ASC
    `
  );

  return rows.map((row) => ({ id: String(row.id), full_name: String(row.full_name) }));
}

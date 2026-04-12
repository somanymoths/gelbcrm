import { randomUUID } from 'crypto';
import mysql from 'mysql2/promise';
import { getMysqlPool } from '@/lib/mysql-pool';

export type VacationType = 'teacher' | 'student' | 'holidays';
export type VacationSlotStatus = 'teacher_vacation' | 'student_vacation' | 'holidays';
export type VacationHistoryStatus = 'planned' | 'active' | 'completed' | 'canceled';
export type VacationModificationType = 'cancel' | 'early_finish' | null;

export type VacationPreviewSlot = {
  slotId: string;
  date: string;
  startTime: string;
  studentId: string | null;
  studentFullName: string | null;
};

export type VacationPreviewResult = {
  impactedSlots: VacationPreviewSlot[];
};

export type VacationHistoryItem = {
  id: string;
  type: VacationType;
  dateFrom: string;
  dateTo: string;
  effectiveDateTo: string;
  status: VacationHistoryStatus;
  comment: string | null;
  createdAt: string;
  createdByLogin: string | null;
  modifiedAt: string | null;
  modifiedByLogin: string | null;
  modificationType: VacationModificationType;
  affectedStudents: Array<{ id: string; fullName: string }>;
  appliedSlotsCount: number;
};

export type VacationHistoryPage = {
  items: VacationHistoryItem[];
  total: number;
  nextOffset: number | null;
};

export type VacationOverlayBySlotId = Map<string, VacationSlotStatus>;

function getPool(): mysql.Pool {
  return getMysqlPool();
}

function getCurrentSchoolIsoDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
}

function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function toIsoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(isoDate: string, delta: number): string {
  const date = parseIsoDate(isoDate);
  date.setUTCDate(date.getUTCDate() + delta);
  return toIsoDate(date);
}

function normalizeComment(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 500);
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value);
}

function parseStudentSnapshot(value: unknown): Array<{ id: string; fullName: string }> {
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value) as Array<{ id?: unknown; fullName?: unknown }>;
    return parsed
      .map((item) => ({
        id: String(item.id ?? ''),
        fullName: String(item.fullName ?? '').trim()
      }))
      .filter((item) => item.id && item.fullName)
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));
  } catch {
    return [];
  }
}

function parseStudentIds(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value) as unknown[];
    return parsed.map((item) => String(item)).filter(Boolean);
  } catch {
    return [];
  }
}

function vacationStatusToSlotStatus(type: VacationType): VacationSlotStatus {
  if (type === 'student') return 'student_vacation';
  if (type === 'holidays') return 'holidays';
  return 'teacher_vacation';
}

function resolveHistoryStatus(input: {
  nowIso: string;
  dateFrom: string;
  effectiveDateTo: string;
  canceledAt: string | null;
}): VacationHistoryStatus {
  if (input.canceledAt) return 'canceled';
  if (input.nowIso < input.dateFrom) return 'planned';
  if (input.nowIso > input.effectiveDateTo) return 'completed';
  return 'active';
}

function isOverlap(fromA: string, toA: string, fromB: string, toB: string): boolean {
  return fromA <= toB && fromB <= toA;
}

async function listTeacherStudents(connection: mysql.PoolConnection, teacherId: string): Promise<Array<{ id: string; fullName: string }>> {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `
      SELECT id, CONCAT(first_name, ' ', last_name) AS full_name
      FROM students
      WHERE assigned_teacher_id = ? AND deleted_at IS NULL
      ORDER BY full_name ASC
    `,
    [teacherId]
  );

  return rows.map((row) => ({
    id: String(row.id),
    fullName: String(row.full_name ?? '').trim()
  }));
}

async function loadConflictCandidates(connection: mysql.PoolConnection, teacherId: string): Promise<
  Array<{
    id: string;
    dateFrom: string;
    effectiveDateTo: string;
    targetStudentIds: string[];
    canceledAt: string | null;
  }>
> {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `
      SELECT
        id,
        DATE_FORMAT(date_from, '%Y-%m-%d') AS date_from,
        DATE_FORMAT(COALESCE(ended_early_date, date_to), '%Y-%m-%d') AS effective_date_to,
        target_student_ids_json,
        canceled_at
      FROM journal_vacations
      WHERE teacher_id = ?
      ORDER BY created_at DESC
    `,
    [teacherId]
  );

  return rows.map((row) => ({
    id: String(row.id),
    dateFrom: String(row.date_from),
    effectiveDateTo: String(row.effective_date_to),
    targetStudentIds: parseStudentIds(row.target_student_ids_json),
    canceledAt: row.canceled_at ? new Date(row.canceled_at).toISOString() : null
  }));
}

function assertNoIntersections(input: {
  candidates: Array<{
    id: string;
    dateFrom: string;
    effectiveDateTo: string;
    targetStudentIds: string[];
    canceledAt: string | null;
  }>;
  dateFrom: string;
  dateTo: string;
  selectedStudentIds: string[];
  ignoreVacationId?: string;
}): void {
  const selected = new Set(input.selectedStudentIds);

  for (const candidate of input.candidates) {
    if (input.ignoreVacationId && candidate.id === input.ignoreVacationId) continue;
    if (candidate.canceledAt) continue;
    if (!isOverlap(input.dateFrom, input.dateTo, candidate.dateFrom, candidate.effectiveDateTo)) continue;

    const intersectsByStudent = candidate.targetStudentIds.some((id) => selected.has(id));
    if (!intersectsByStudent) continue;

    throw new Error('VACATION_PERIOD_INTERSECTION');
  }
}

async function listPlannedSlotsForVacation(connection: mysql.PoolConnection, input: {
  teacherId: string;
  dateFrom: string;
  dateTo: string;
  selectedStudentIds: string[];
}): Promise<VacationPreviewSlot[]> {
  if (input.selectedStudentIds.length === 0) return [];

  const placeholders = input.selectedStudentIds.map(() => '?').join(', ');
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `
      SELECT
        ls.id,
        DATE_FORMAT(ls.date, '%Y-%m-%d') AS date,
        DATE_FORMAT(ls.start_time, '%H:%i') AS start_time,
        ls.student_id,
        CONCAT(s.first_name, ' ', s.last_name) AS student_full_name
      FROM lesson_slots ls
      LEFT JOIN students s ON s.id = ls.student_id
      WHERE ls.teacher_id = ?
        AND ls.date BETWEEN ? AND ?
        AND ls.status = 'planned'
        AND ls.source_weekly_slot_id IS NOT NULL
        AND ls.student_id IN (${placeholders})
        AND NOT EXISTS (
          SELECT 1
          FROM lesson_slots src
          WHERE src.rescheduled_to_slot_id = ls.id
        )
      ORDER BY ls.date ASC, ls.start_time ASC, ls.id ASC
    `,
    [input.teacherId, input.dateFrom, input.dateTo, ...input.selectedStudentIds]
  );

  return rows.map((row) => ({
    slotId: String(row.id),
    date: String(row.date),
    startTime: String(row.start_time),
    studentId: row.student_id ? String(row.student_id) : null,
    studentFullName: row.student_full_name ? String(row.student_full_name) : null
  }));
}

export async function previewJournalVacation(input: {
  teacherId: string;
  type: VacationType;
  dateFrom: string;
  dateTo: string;
  selectedStudentIds: string[];
}): Promise<VacationPreviewResult> {
  const connection = await getPool().getConnection();
  try {
    const candidates = await loadConflictCandidates(connection, input.teacherId);
    assertNoIntersections({
      candidates,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      selectedStudentIds: [...new Set(input.selectedStudentIds)]
    });

    const impactedSlots = await listPlannedSlotsForVacation(connection, input);
    return { impactedSlots };
  } finally {
    connection.release();
  }
}

export async function createJournalVacation(input: {
  teacherId: string;
  actorUserId: string;
  type: VacationType;
  dateFrom: string;
  dateTo: string;
  selectedStudentIds: string[];
  comment?: string | null;
}): Promise<{ id: string; impactedCount: number }> {
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();

    const today = getCurrentSchoolIsoDate();
    const minDate = addDays(today, 1);

    if (input.dateFrom < minDate) throw new Error('VACATION_START_TOO_EARLY');
    if (input.dateTo < input.dateFrom) throw new Error('INVALID_DATE_RANGE');

    const students = await listTeacherStudents(connection, input.teacherId);
    if (students.length === 0) throw new Error('VACATION_NO_STUDENTS_FOR_TEACHER');

    const knownStudentIds = new Set(students.map((student) => student.id));
    const selectedUnique = [...new Set(input.selectedStudentIds)].filter((id) => knownStudentIds.has(id));

    if ((input.type === 'teacher' || input.type === 'holidays') && selectedUnique.length === 0) {
      throw new Error('VACATION_STUDENTS_REQUIRED');
    }

    if (input.type === 'student' && selectedUnique.length !== 1) {
      throw new Error('VACATION_STUDENT_SINGLE_REQUIRED');
    }

    const candidates = await loadConflictCandidates(connection, input.teacherId);
    assertNoIntersections({
      candidates,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      selectedStudentIds: selectedUnique
    });

    const snapshot = students
      .filter((student) => selectedUnique.includes(student.id))
      .map((student) => ({ id: student.id, fullName: student.fullName }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));

    const vacationId = randomUUID();
    const slots = await listPlannedSlotsForVacation(connection, {
      teacherId: input.teacherId,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      selectedStudentIds: selectedUnique
    });

    await connection.query<mysql.ResultSetHeader>(
      `
        INSERT INTO journal_vacations (
          id,
          teacher_id,
          vacation_type,
          date_from,
          date_to,
          comment_text,
          target_student_ids_json,
          target_students_snapshot_json,
          applied_slots_count,
          created_by_user_id
        )
        VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?, ?)
      `,
      [
        vacationId,
        input.teacherId,
        input.type,
        input.dateFrom,
        input.dateTo,
        normalizeComment(input.comment),
        stringifyJson(selectedUnique),
        stringifyJson(snapshot),
        slots.length,
        input.actorUserId
      ]
    );

    if (slots.length > 0) {
      const vacationStatus = vacationStatusToSlotStatus(input.type);
      const valuesSql = slots.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, 1)').join(', ');
      const values: unknown[] = [];
      for (const slot of slots) {
        values.push(
          vacationId,
          input.teacherId,
          slot.slotId,
          slot.date,
          slot.startTime,
          slot.studentId,
          slot.studentFullName,
          vacationStatus
        );
      }

      await connection.query<mysql.ResultSetHeader>(
        `
          INSERT INTO journal_vacation_slots (
            vacation_id,
            teacher_id,
            slot_id,
            slot_date,
            slot_start_time,
            student_id,
            student_full_name,
            vacation_status,
            is_active
          )
          VALUES ${valuesSql}
        `,
        values
      );
    }

    await connection.commit();
    return { id: vacationId, impactedCount: slots.length };
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

export async function listJournalVacationsHistory(input: {
  teacherId: string;
  limit: number;
  offset: number;
}): Promise<VacationHistoryPage> {
  const safeLimit = Math.max(1, Math.min(100, Number(input.limit || 20)));
  const safeOffset = Math.max(0, Number(input.offset || 0));
  const nowIso = getCurrentSchoolIsoDate();

  const [rows, totalRows] = await Promise.all([
    getPool().query<mysql.RowDataPacket[]>(
      `
        SELECT
          v.id,
          v.vacation_type,
          DATE_FORMAT(v.date_from, '%Y-%m-%d') AS date_from,
          DATE_FORMAT(v.date_to, '%Y-%m-%d') AS date_to,
          DATE_FORMAT(COALESCE(v.ended_early_date, v.date_to), '%Y-%m-%d') AS effective_date_to,
          v.comment_text,
          v.target_students_snapshot_json,
          v.applied_slots_count,
          v.created_at,
          creator.login AS created_by_login,
          v.modified_at,
          modifier.login AS modified_by_login,
          v.modification_type,
          v.canceled_at
        FROM journal_vacations v
        LEFT JOIN users creator ON creator.id = v.created_by_user_id
        LEFT JOIN users modifier ON modifier.id = v.modified_by_user_id
        WHERE v.teacher_id = ?
        ORDER BY v.created_at DESC, v.id DESC
        LIMIT ? OFFSET ?
      `,
      [input.teacherId, safeLimit, safeOffset]
    ),
    getPool().query<mysql.RowDataPacket[]>(
      `
        SELECT COUNT(*) AS total
        FROM journal_vacations
        WHERE teacher_id = ?
      `,
      [input.teacherId]
    )
  ]);

  const list = rows[0].map((row) => {
    const dateFrom = String(row.date_from);
    const dateTo = String(row.date_to);
    const effectiveDateTo = String(row.effective_date_to);
    const canceledAt = row.canceled_at ? new Date(row.canceled_at).toISOString() : null;

    return {
      id: String(row.id),
      type: String(row.vacation_type) as VacationType,
      dateFrom,
      dateTo,
      effectiveDateTo,
      status: resolveHistoryStatus({ nowIso, dateFrom, effectiveDateTo, canceledAt }),
      comment: row.comment_text ? String(row.comment_text) : null,
      createdAt: new Date(row.created_at).toISOString(),
      createdByLogin: row.created_by_login ? String(row.created_by_login) : null,
      modifiedAt: row.modified_at ? new Date(row.modified_at).toISOString() : null,
      modifiedByLogin: row.modified_by_login ? String(row.modified_by_login) : null,
      modificationType: row.modification_type ? (String(row.modification_type) as VacationModificationType) : null,
      affectedStudents: parseStudentSnapshot(row.target_students_snapshot_json),
      appliedSlotsCount: Math.max(0, Number(row.applied_slots_count ?? 0))
    } satisfies VacationHistoryItem;
  });

  const total = Math.max(0, Number(totalRows[0][0]?.total ?? 0));
  const nextOffset = safeOffset + list.length < total ? safeOffset + list.length : null;

  return { items: list, total, nextOffset };
}

export async function getVacationOverlayBySlotIds(input: {
  teacherId: string;
  slotIds: string[];
}): Promise<VacationOverlayBySlotId> {
  const result: VacationOverlayBySlotId = new Map();
  if (input.slotIds.length === 0) return result;

  const uniqueSlotIds = [...new Set(input.slotIds)];
  const placeholders = uniqueSlotIds.map(() => '?').join(', ');
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT slot_id, vacation_status
      FROM journal_vacation_slots
      WHERE teacher_id = ?
        AND is_active = 1
        AND slot_id IN (${placeholders})
      ORDER BY id DESC
    `,
    [input.teacherId, ...uniqueSlotIds]
  );

  for (const row of rows) {
    const slotId = String(row.slot_id);
    if (result.has(slotId)) continue;
    result.set(slotId, String(row.vacation_status) as VacationSlotStatus);
  }

  return result;
}

export async function listVacationPlannedCountsBeforeDate(input: {
  teacherId: string;
  date: string;
}): Promise<Array<{ student_id: string; planned_count: number }>> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT
        student_id,
        COUNT(*) AS planned_count
      FROM journal_vacation_slots
      WHERE teacher_id = ?
        AND is_active = 1
        AND student_id IS NOT NULL
        AND slot_date < ?
      GROUP BY student_id
    `,
    [input.teacherId, input.date]
  );

  return rows.map((row) => ({
    student_id: String(row.student_id),
    planned_count: Math.max(0, Number(row.planned_count ?? 0))
  }));
}

async function loadVacationForAction(connection: mysql.PoolConnection, vacationId: string, teacherId: string): Promise<
  | {
      id: string;
      dateFrom: string;
      dateTo: string;
      effectiveDateTo: string;
      canceledAt: string | null;
    }
  | null
> {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `
      SELECT
        id,
        DATE_FORMAT(date_from, '%Y-%m-%d') AS date_from,
        DATE_FORMAT(date_to, '%Y-%m-%d') AS date_to,
        DATE_FORMAT(COALESCE(ended_early_date, date_to), '%Y-%m-%d') AS effective_date_to,
        canceled_at
      FROM journal_vacations
      WHERE id = ? AND teacher_id = ?
      LIMIT 1
    `,
    [vacationId, teacherId]
  );

  if (rows.length === 0) return null;

  return {
    id: String(rows[0].id),
    dateFrom: String(rows[0].date_from),
    dateTo: String(rows[0].date_to),
    effectiveDateTo: String(rows[0].effective_date_to),
    canceledAt: rows[0].canceled_at ? new Date(rows[0].canceled_at).toISOString() : null
  };
}

export async function previewVacationRollbackCount(input: {
  vacationId: string;
  teacherId: string;
  mode: 'cancel' | 'early_finish';
  earlyFinishDate?: string;
}): Promise<number> {
  const connection = await getPool().getConnection();
  try {
    if (input.mode === 'cancel') {
      const [rows] = await connection.query<mysql.RowDataPacket[]>(
        `
          SELECT COUNT(*) AS total
          FROM journal_vacation_slots
          WHERE vacation_id = ? AND teacher_id = ? AND is_active = 1
        `,
        [input.vacationId, input.teacherId]
      );
      return Math.max(0, Number(rows[0]?.total ?? 0));
    }

    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      `
        SELECT COUNT(*) AS total
        FROM journal_vacation_slots
        WHERE vacation_id = ?
          AND teacher_id = ?
          AND is_active = 1
          AND slot_date > ?
      `,
      [input.vacationId, input.teacherId, input.earlyFinishDate ?? '9999-12-31']
    );

    return Math.max(0, Number(rows[0]?.total ?? 0));
  } finally {
    connection.release();
  }
}

export async function cancelPlannedVacation(input: {
  vacationId: string;
  teacherId: string;
  actorUserId: string;
}): Promise<{ rollbackCount: number }> {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();

    const vacation = await loadVacationForAction(connection, input.vacationId, input.teacherId);
    if (!vacation) throw new Error('VACATION_NOT_FOUND');
    if (vacation.canceledAt) throw new Error('VACATION_ALREADY_CANCELED');

    const nowIso = getCurrentSchoolIsoDate();
    if (!(nowIso < vacation.dateFrom)) {
      throw new Error('VACATION_CANCEL_ALLOWED_ONLY_PLANNED');
    }

    const [countRows] = await connection.query<mysql.RowDataPacket[]>(
      `
        SELECT COUNT(*) AS total
        FROM journal_vacation_slots
        WHERE vacation_id = ? AND teacher_id = ? AND is_active = 1
      `,
      [input.vacationId, input.teacherId]
    );
    const rollbackCount = Math.max(0, Number(countRows[0]?.total ?? 0));

    await connection.query<mysql.ResultSetHeader>(
      `
        UPDATE journal_vacation_slots
        SET is_active = 0
        WHERE vacation_id = ? AND teacher_id = ? AND is_active = 1
      `,
      [input.vacationId, input.teacherId]
    );

    await connection.query<mysql.ResultSetHeader>(
      `
        UPDATE journal_vacations
        SET
          canceled_at = CURRENT_TIMESTAMP,
          canceled_by_user_id = ?,
          modified_by_user_id = ?,
          modified_at = CURRENT_TIMESTAMP,
          modification_type = 'cancel',
          applied_slots_count = 0
        WHERE id = ? AND teacher_id = ?
      `,
      [input.actorUserId, input.actorUserId, input.vacationId, input.teacherId]
    );

    await connection.commit();
    return { rollbackCount };
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

export async function finishVacationEarly(input: {
  vacationId: string;
  teacherId: string;
  actorUserId: string;
  earlyFinishDate: string;
}): Promise<{ rollbackCount: number }> {
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();

    const vacation = await loadVacationForAction(connection, input.vacationId, input.teacherId);
    if (!vacation) throw new Error('VACATION_NOT_FOUND');
    if (vacation.canceledAt) throw new Error('VACATION_ALREADY_CANCELED');

    const today = getCurrentSchoolIsoDate();
    if (!(today >= vacation.dateFrom && today <= vacation.effectiveDateTo)) {
      throw new Error('VACATION_EARLY_FINISH_ALLOWED_ONLY_ACTIVE');
    }

    const minDate = addDays(today, -1);
    const maxDate = addDays(vacation.effectiveDateTo, -1);
    if (input.earlyFinishDate < minDate || input.earlyFinishDate > maxDate) {
      throw new Error('VACATION_EARLY_FINISH_DATE_OUT_OF_RANGE');
    }

    const [countRows] = await connection.query<mysql.RowDataPacket[]>(
      `
        SELECT COUNT(*) AS total
        FROM journal_vacation_slots
        WHERE vacation_id = ?
          AND teacher_id = ?
          AND is_active = 1
          AND slot_date > ?
      `,
      [input.vacationId, input.teacherId, input.earlyFinishDate]
    );
    const rollbackCount = Math.max(0, Number(countRows[0]?.total ?? 0));

    await connection.query<mysql.ResultSetHeader>(
      `
        UPDATE journal_vacation_slots
        SET is_active = 0
        WHERE vacation_id = ?
          AND teacher_id = ?
          AND is_active = 1
          AND slot_date > ?
      `,
      [input.vacationId, input.teacherId, input.earlyFinishDate]
    );

    const [activeRows] = await connection.query<mysql.RowDataPacket[]>(
      `
        SELECT COUNT(*) AS total
        FROM journal_vacation_slots
        WHERE vacation_id = ? AND teacher_id = ? AND is_active = 1
      `,
      [input.vacationId, input.teacherId]
    );
    const activeCount = Math.max(0, Number(activeRows[0]?.total ?? 0));

    await connection.query<mysql.ResultSetHeader>(
      `
        UPDATE journal_vacations
        SET
          ended_early_at = CURRENT_TIMESTAMP,
          ended_early_by_user_id = ?,
          ended_early_date = ?,
          modified_by_user_id = ?,
          modified_at = CURRENT_TIMESTAMP,
          modification_type = 'early_finish',
          applied_slots_count = ?
        WHERE id = ? AND teacher_id = ?
      `,
      [input.actorUserId, input.earlyFinishDate, input.actorUserId, activeCount, input.vacationId, input.teacherId]
    );

    await connection.commit();
    return { rollbackCount };
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

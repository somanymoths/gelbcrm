import mysql from 'mysql2/promise';
import { getMysqlPool } from '@/lib/mysql-pool';

export type LentaStatus =
  | 'planned'
  | 'overdue'
  | 'completed'
  | 'rescheduled'
  | 'canceled'
  | 'teacher_vacation'
  | 'student_vacation'
  | 'holidays';

export type LentaSettings = {
  acquiringPercent: number;
  taxPercent: number;
  fundDevelopmentPercent: number;
  fundSafetyPercent: number;
  fundDividendsPercent: number;
};

export const DEFAULT_LENTA_SETTINGS: LentaSettings = {
  acquiringPercent: 3.5,
  taxPercent: 4,
  fundDevelopmentPercent: 40,
  fundSafetyPercent: 30,
  fundDividendsPercent: 30
};

const OLD_STUDENT_NAMES = new Set([
  'Юлия Шварцберг',
  'Юлия Николаева',
  'Ирина Илющенко',
  'Анна Арцт',
  'Борис Добровольский',
  'Екатерина Быкова',
  'Наталья Эльвейн',
  'Александр Ходаков'
]);

export type LentaFilters = {
  dateFrom: string;
  dateTo: string;
  teacherId?: string;
  studentId?: string;
  status?: LentaStatus;
};

type RawLentaEvent = {
  id: string;
  event_number: number;
  date: string;
  start_time: string;
  source_weekly_slot_id: string | null;
  teacher_id: string;
  teacher_name: string;
  student_id: string;
  student_name: string;
  student_paid_lessons_left: number | null;
  teacher_rate_rub: number | null;
  status: LentaStatus;
  reschedule_target_date: string | null;
  reschedule_target_time: string | null;
  reschedule_source_date: string | null;
  reschedule_source_time: string | null;
};

type PaidPackage = {
  studentId: string;
  lessonsCount: number;
  pricePerLessonRub: number;
  paidAt: string;
  paymentLinkId: string;
};

export type LentaEventItem = {
  id: string;
  eventNumber: number;
  lessonDate: string;
  lessonTime: string;
  teacherId: string;
  teacherName: string;
  studentId: string;
  studentName: string;
  status: LentaStatus;
  statusLabel: string;
  isCompleted: boolean;
  remainingPaidLessons: number | null;
  remainingPaidLessonsPaidAt: string | null;
  lessonPrice: number;
  acquiring: number;
  taxes: number;
  salary: number;
  profit: number;
  development: number;
  safety: number;
  dividends: number;
  yulia: number;
  stas: number;
  sourcePaymentLinkId: string | null;
  rescheduleTargetDate: string | null;
  rescheduleTargetTime: string | null;
  rescheduleSourceDate: string | null;
  rescheduleSourceTime: string | null;
  isOldStudent: boolean;
};

export type LentaTotals = {
  completedCount: number;
  lessonPrice: number;
  acquiring: number;
  taxes: number;
  salary: number;
  profit: number;
  development: number;
  safety: number;
  dividends: number;
  yulia: number;
  stas: number;
};

export type LentaListResult = {
  items: LentaEventItem[];
  totalCount: number;
  nextOffset: number | null;
  totals: LentaTotals;
  teachers: Array<{ id: string; name: string }>;
  students: Array<{ id: string; name: string }>;
};

type EventWithOrder = RawLentaEvent & { sortKey: string };
type PackageAssignment = { remaining: number; paidAt: string | null; paymentLinkId: string | null };

function getPool(): mysql.Pool {
  return getMysqlPool();
}

export function getLentaStatusLabel(status: LentaStatus): string {
  if (status === 'teacher_vacation') return 'Отпуск учителя';
  if (status === 'student_vacation') return 'Отпуск ученика';
  if (status === 'holidays') return 'Праздники';
  if (status === 'completed') return 'Завершено';
  if (status === 'overdue') return 'Просрочено';
  if (status === 'rescheduled') return 'Перенесено';
  if (status === 'canceled') return 'Отменено';
  return 'Запланировано';
}

export function roundRub(value: number): number {
  return Math.round(value);
}

export function calculateLentaMoney(input: {
  lessonPrice: number;
  salary: number;
  settings: LentaSettings;
}): Omit<
  LentaEventItem,
  | 'id'
  | 'eventNumber'
  | 'lessonDate'
  | 'lessonTime'
  | 'teacherId'
  | 'teacherName'
  | 'studentId'
  | 'studentName'
  | 'status'
  | 'statusLabel'
  | 'isCompleted'
  | 'remainingPaidLessons'
  | 'remainingPaidLessonsPaidAt'
  | 'sourcePaymentLinkId'
  | 'rescheduleTargetDate'
  | 'rescheduleTargetTime'
  | 'rescheduleSourceDate'
  | 'rescheduleSourceTime'
  | 'isOldStudent'
> {
  const acquiring = roundRub((input.lessonPrice * input.settings.acquiringPercent) / 100);
  const taxes = roundRub((input.lessonPrice * input.settings.taxPercent) / 100);
  const profit = roundRub(input.lessonPrice - acquiring - taxes - input.salary);
  const development = roundRub((profit * input.settings.fundDevelopmentPercent) / 100);
  const safety = roundRub((profit * input.settings.fundSafetyPercent) / 100);
  const dividends = roundRub((profit * input.settings.fundDividendsPercent) / 100);
  const yulia = roundRub(dividends / 2);
  const stas = dividends - yulia;

  return {
    lessonPrice: input.lessonPrice,
    acquiring,
    taxes,
    salary: input.salary,
    profit,
    development,
    safety,
    dividends,
    yulia,
    stas
  };
}

function isOldStudentName(value: string): boolean {
  return OLD_STUDENT_NAMES.has(value.trim());
}

export function buildLentaTotals(items: LentaEventItem[]): LentaTotals {
  const completed = items.filter((item) => item.isCompleted);
  return completed.reduce<LentaTotals>(
    (acc, item) => {
      acc.completedCount += 1;
      acc.lessonPrice += item.lessonPrice;
      acc.acquiring += item.acquiring;
      acc.taxes += item.taxes;
      acc.salary += item.salary;
      acc.profit += item.profit;
      acc.development += item.development;
      acc.safety += item.safety;
      acc.dividends += item.dividends;
      acc.yulia += item.yulia;
      acc.stas += item.stas;
      return acc;
    },
    {
      completedCount: 0,
      lessonPrice: 0,
      acquiring: 0,
      taxes: 0,
      salary: 0,
      profit: 0,
      development: 0,
      safety: 0,
      dividends: 0,
      yulia: 0,
      stas: 0
    }
  );
}

function makeSortKey(event: Pick<RawLentaEvent, 'date' | 'start_time' | 'id'>): string {
  return `${event.date}T${event.start_time}#${event.id}`;
}

function getPlannedPreviewHorizonIso(today = new Date()): string {
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDayNextMonth = new Date(year, month + 1, 1);
  const horizon = new Date(firstDayNextMonth.getFullYear(), firstDayNextMonth.getMonth(), 7);
  return `${horizon.getFullYear()}-${String(horizon.getMonth() + 1).padStart(2, '0')}-${String(horizon.getDate()).padStart(2, '0')}`;
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
}

function isMysqlTableMissingError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = String((error as { code?: unknown }).code ?? '');
  const errno = Number((error as { errno?: unknown }).errno ?? 0);
  return code === 'ER_NO_SUCH_TABLE' || errno === 1146;
}

function isMysqlSyntaxCompatError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = String((error as { code?: unknown }).code ?? '');
  const errno = Number((error as { errno?: unknown }).errno ?? 0);
  return code === 'ER_PARSE_ERROR' || errno === 1064;
}

async function ensureLentaSettingsTable(): Promise<void> {
  const pool = getPool();
  await pool.query(
    `
      CREATE TABLE IF NOT EXISTS lenta_settings (
        id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
        acquiring_percent DECIMAL(6,3) NOT NULL DEFAULT 3.5,
        tax_percent DECIMAL(6,3) NOT NULL DEFAULT 4.0,
        fund_development_percent DECIMAL(6,3) NOT NULL DEFAULT 40.0,
        fund_safety_percent DECIMAL(6,3) NOT NULL DEFAULT 30.0,
        fund_dividends_percent DECIMAL(6,3) NOT NULL DEFAULT 30.0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `
  );
}

function getStatusFromRow(row: mysql.RowDataPacket): LentaStatus {
  return String(row.status) as LentaStatus;
}

function createWhereSql(input: {
  teacherId?: string;
  studentId?: string;
  status?: LentaStatus;
  yearFrom: number;
  yearTo: number;
}, includeVacationAlias: boolean): { sql: string; params: unknown[] } {
  const where: string[] = ['ls.student_id IS NOT NULL', 'YEAR(ls.date) BETWEEN ? AND ?', 't.full_name <> ?'];
  const params: unknown[] = [input.yearFrom, input.yearTo, 'Юля Тест'];

  if (input.teacherId) {
    where.push('ls.teacher_id = ?');
    params.push(input.teacherId);
  }

  if (input.studentId) {
    where.push('ls.student_id = ?');
    params.push(input.studentId);
  }

  if (input.status) {
    if (includeVacationAlias) {
      where.push('COALESCE(jvs.vacation_status, ls.status) = ?');
    } else {
      where.push('ls.status = ?');
    }
    params.push(input.status);
  }

  return { sql: where.join(' AND '), params };
}

async function listRawEvents(input: LentaFilters): Promise<RawLentaEvent[]> {
  const pool = getPool();
  const yearFrom = Number(input.dateFrom.slice(0, 4));
  const yearTo = Number(input.dateTo.slice(0, 4));
  const scope = {
    yearFrom: Math.min(yearFrom, yearTo),
    yearTo: Math.max(yearFrom, yearTo),
    teacherId: input.teacherId,
    studentId: input.studentId,
    status: input.status
  };

  const whereWithVacation = createWhereSql(scope, true);
  const whereFallback = createWhereSql(scope, false);
  const baseSelect = `
    SELECT
      ls.id,
      DATE_FORMAT(ls.date, '%Y-%m-%d') AS date,
      TIME_FORMAT(ls.start_time, '%H:%i:%s') AS start_time,
      ls.source_weekly_slot_id,
      ls.teacher_id,
      t.full_name AS teacher_name,
      ls.student_id,
      TRIM(CONCAT(COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, ''))) AS student_name,
      s.paid_lessons_left AS student_paid_lessons_left,
      t.rate_rub AS teacher_rate_rub,
      COALESCE(jvs.vacation_status, ls.status) AS status,
      DATE_FORMAT(rsl.date, '%Y-%m-%d') AS reschedule_target_date,
      TIME_FORMAT(rsl.start_time, '%H:%i:%s') AS reschedule_target_time,
      DATE_FORMAT(rsrc.source_date, '%Y-%m-%d') AS reschedule_source_date,
      TIME_FORMAT(rsrc.source_time, '%H:%i:%s') AS reschedule_source_time
    FROM lesson_slots ls
    INNER JOIN teachers t ON t.id = ls.teacher_id
    LEFT JOIN students s ON s.id = ls.student_id
    LEFT JOIN journal_vacation_slots jvs
      ON jvs.slot_id = ls.id
     AND jvs.is_active = 1
    LEFT JOIN lesson_slots rsl ON rsl.id = ls.rescheduled_to_slot_id
    LEFT JOIN (
      SELECT
        rescheduled_to_slot_id AS target_slot_id,
        MAX(date) AS source_date,
        MAX(start_time) AS source_time
      FROM lesson_slots
      WHERE rescheduled_to_slot_id IS NOT NULL
      GROUP BY rescheduled_to_slot_id
    ) rsrc ON rsrc.target_slot_id = ls.id
    WHERE ${whereWithVacation.sql}
    ORDER BY ls.date ASC, ls.start_time ASC, ls.id ASC
  `;

  const fallbackSelect = `
    SELECT
      ls.id,
      DATE_FORMAT(ls.date, '%Y-%m-%d') AS date,
      TIME_FORMAT(ls.start_time, '%H:%i:%s') AS start_time,
      ls.source_weekly_slot_id,
      ls.teacher_id,
      t.full_name AS teacher_name,
      ls.student_id,
      TRIM(CONCAT(COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, ''))) AS student_name,
      s.paid_lessons_left AS student_paid_lessons_left,
      t.rate_rub AS teacher_rate_rub,
      ls.status AS status,
      DATE_FORMAT(rsl.date, '%Y-%m-%d') AS reschedule_target_date,
      TIME_FORMAT(rsl.start_time, '%H:%i:%s') AS reschedule_target_time,
      DATE_FORMAT(rsrc.source_date, '%Y-%m-%d') AS reschedule_source_date,
      TIME_FORMAT(rsrc.source_time, '%H:%i:%s') AS reschedule_source_time
    FROM lesson_slots ls
    INNER JOIN teachers t ON t.id = ls.teacher_id
    LEFT JOIN students s ON s.id = ls.student_id
    LEFT JOIN lesson_slots rsl ON rsl.id = ls.rescheduled_to_slot_id
    LEFT JOIN (
      SELECT
        rescheduled_to_slot_id AS target_slot_id,
        MAX(date) AS source_date,
        MAX(start_time) AS source_time
      FROM lesson_slots
      WHERE rescheduled_to_slot_id IS NOT NULL
      GROUP BY rescheduled_to_slot_id
    ) rsrc ON rsrc.target_slot_id = ls.id
    WHERE ${whereFallback.sql}
    ORDER BY ls.date ASC, ls.start_time ASC, ls.id ASC
  `;

  let rows: mysql.RowDataPacket[] = [];

  try {
    const [result] = await pool.query<mysql.RowDataPacket[]>(baseSelect, whereWithVacation.params);
    rows = result;
  } catch (error) {
    if (!isMysqlTableMissingError(error) && !isMysqlSyntaxCompatError(error)) {
      throw error;
    }
    const [fallbackRows] = await pool.query<mysql.RowDataPacket[]>(fallbackSelect, whereFallback.params);
    rows = fallbackRows;
  }

  const mappedAsc = rows.map((row) => ({
    id: String(row.id),
    event_number: 0,
    date: String(row.date),
    start_time: String(row.start_time),
    source_weekly_slot_id: row.source_weekly_slot_id ? String(row.source_weekly_slot_id) : null,
    teacher_id: String(row.teacher_id),
    teacher_name: String(row.teacher_name ?? ''),
    student_id: String(row.student_id),
    student_name: String(row.student_name ?? '—'),
    student_paid_lessons_left: row.student_paid_lessons_left === null ? null : Number(row.student_paid_lessons_left),
    teacher_rate_rub: row.teacher_rate_rub === null ? null : Number(row.teacher_rate_rub),
    status: getStatusFromRow(row),
    reschedule_target_date: row.reschedule_target_date ? String(row.reschedule_target_date) : null,
    reschedule_target_time: row.reschedule_target_time ? String(row.reschedule_target_time) : null,
    reschedule_source_date: row.reschedule_source_date ? String(row.reschedule_source_date) : null,
    reschedule_source_time: row.reschedule_source_time ? String(row.reschedule_source_time) : null
  }));

  const byYearCounter = new Map<string, number>();
  for (const item of mappedAsc) {
    const year = item.date.slice(0, 4);
    const next = (byYearCounter.get(year) ?? 0) + 1;
    byYearCounter.set(year, next);
    item.event_number = next;
  }

  const filteredByPeriod = mappedAsc.filter((item) => item.date >= input.dateFrom && item.date <= input.dateTo);
  const plannedHorizon = getPlannedPreviewHorizonIso();
  const plannedTail = mappedAsc.filter(
    (item) => item.status === 'planned' && item.date > input.dateTo && item.date <= plannedHorizon
  );

  if (plannedTail.length === 0) {
    return filteredByPeriod;
  }

  const merged = [...filteredByPeriod];
  const existingIds = new Set(merged.map((item) => item.id));
  for (const item of plannedTail) {
    if (existingIds.has(item.id)) continue;
    merged.push(item);
    existingIds.add(item.id);
  }

  merged.sort((a, b) => {
    const aKey = makeSortKey(a);
    const bKey = makeSortKey(b);
    if (aKey > bKey) return 1;
    if (aKey < bKey) return -1;
    return 0;
  });

  return merged;
}

async function listPaidPackages(studentIds: string[]): Promise<Map<string, PaidPackage[]>> {
  if (studentIds.length === 0) return new Map();

  const pool = getPool();
  const placeholders = studentIds.map(() => '?').join(', ');
  const queryWithYookassa = `
    SELECT
      spl.id,
      spl.student_id,
      tp.lessons_count,
      tp.price_per_lesson_rub,
      DATE_FORMAT(COALESCE(yp.paid_at, spl.updated_at, spl.created_at), '%Y-%m-%d %H:%i:%s') AS paid_at
    FROM student_payment_links spl
    INNER JOIN tariff_packages tp ON tp.id = spl.tariff_package_id
    LEFT JOIN yookassa_payments yp ON yp.provider_payment_id = spl.provider_payment_id
    WHERE spl.status = 'paid'
      AND spl.student_id IN (${placeholders})
    ORDER BY spl.student_id ASC, COALESCE(yp.paid_at, spl.updated_at, spl.created_at) ASC, spl.id ASC
  `;

  const queryFallback = `
    SELECT
      spl.id,
      spl.student_id,
      tp.lessons_count,
      tp.price_per_lesson_rub,
      DATE_FORMAT(COALESCE(spl.updated_at, spl.created_at), '%Y-%m-%d %H:%i:%s') AS paid_at
    FROM student_payment_links spl
    INNER JOIN tariff_packages tp ON tp.id = spl.tariff_package_id
    WHERE spl.status = 'paid'
      AND spl.student_id IN (${placeholders})
    ORDER BY spl.student_id ASC, COALESCE(spl.updated_at, spl.created_at) ASC, spl.id ASC
  `;

  let rows: mysql.RowDataPacket[] = [];
  try {
    const [result] = await pool.query<mysql.RowDataPacket[]>(queryWithYookassa, studentIds);
    rows = result;
  } catch (error) {
    if (!isMysqlTableMissingError(error) && !isMysqlSyntaxCompatError(error)) {
      throw error;
    }
    const [fallbackRows] = await pool.query<mysql.RowDataPacket[]>(queryFallback, studentIds);
    rows = fallbackRows;
  }

  const byStudent = new Map<string, PaidPackage[]>();

  for (const row of rows) {
    const studentId = String(row.student_id);
    const next: PaidPackage = {
      studentId,
      lessonsCount: Math.max(0, Number(row.lessons_count ?? 0)),
      pricePerLessonRub: toNumber(row.price_per_lesson_rub),
      paidAt: String(row.paid_at ?? ''),
      paymentLinkId: String(row.id)
    };
    const list = byStudent.get(studentId) ?? [];
    list.push(next);
    byStudent.set(studentId, list);
  }

  return byStudent;
}

function pickPackageByOrdinal(packages: PaidPackage[], ordinal: number): PaidPackage | null {
  if (packages.length === 0) return null;
  let cumulative = 0;

  for (const item of packages) {
    cumulative += Math.max(0, item.lessonsCount);
    if (ordinal <= cumulative) {
      return item;
    }
  }

  return packages[packages.length - 1] ?? null;
}

function enrichWithFinancials(input: {
  events: RawLentaEvent[];
  packageByStudentId: Map<string, PaidPackage[]>;
  settings: LentaSettings;
}): LentaEventItem[] {
  const ascByStudent = new Map<string, EventWithOrder[]>();
  for (const event of input.events) {
    const list = ascByStudent.get(event.student_id) ?? [];
    list.push({ ...event, sortKey: makeSortKey(event) });
    ascByStudent.set(event.student_id, list);
  }

  const byId = new Map<string, { price: number; sourcePaymentLinkId: string | null }>();

  for (const [studentId, list] of ascByStudent.entries()) {
    list.sort((a, b) => (a.sortKey > b.sortKey ? 1 : a.sortKey < b.sortKey ? -1 : 0));

    const packages = input.packageByStudentId.get(studentId) ?? [];
    let completedConsumed = 0;

    for (const event of list) {
      const ordinal = Math.max(1, completedConsumed + 1);
      const linkedPackage = pickPackageByOrdinal(packages, ordinal);
      byId.set(event.id, {
        price: linkedPackage ? roundRub(linkedPackage.pricePerLessonRub) : 0,
        sourcePaymentLinkId: linkedPackage?.paymentLinkId ?? null
      });

      if (event.status === 'completed') {
        completedConsumed += 1;
      }
    }
  }

  const packageAssignmentBySlotId = new Map<string, PackageAssignment>();
  for (const [studentId, list] of ascByStudent.entries()) {
    const sorted = [...list].sort((a, b) => (a.sortKey > b.sortKey ? 1 : a.sortKey < b.sortKey ? -1 : 0));
    const packages = input.packageByStudentId.get(studentId) ?? [];
    const consuming = sorted.filter((slot) => slot.status === 'completed' || slot.status === 'planned' || slot.status === 'overdue');

    let packageIndex = 0;
    let usedInPackage = 0;

    for (const slot of consuming) {
      while (packageIndex < packages.length) {
        const size = Math.max(0, Number(packages[packageIndex]?.lessonsCount ?? 0));
        if (size > 0 && usedInPackage < size) break;
        packageIndex += 1;
        usedInPackage = 0;
      }

      if (packageIndex >= packages.length) break;

      const pkg = packages[packageIndex];
      const packageSize = Math.max(0, Number(pkg.lessonsCount ?? 0));
      if (packageSize <= 0) {
        packageIndex += 1;
        usedInPackage = 0;
        continue;
      }

      usedInPackage += 1;
      packageAssignmentBySlotId.set(slot.id, {
        remaining: usedInPackage,
        paidAt: pkg.paidAt || null,
        paymentLinkId: pkg.paymentLinkId ?? null
      });
    }

    let backwardCursor: PackageAssignment | null = null;
    for (let index = sorted.length - 1; index >= 0; index -= 1) {
      const slot = sorted[index];
      const anchor = packageAssignmentBySlotId.get(slot.id);
      if (anchor) {
        backwardCursor = anchor;
        continue;
      }
      if (backwardCursor) {
        packageAssignmentBySlotId.set(slot.id, backwardCursor);
      }
    }

    let forwardCursor: PackageAssignment | null = null;
    for (let index = 0; index < sorted.length; index += 1) {
      const slot = sorted[index];
      const anchor = packageAssignmentBySlotId.get(slot.id);
      if (anchor) {
        forwardCursor = anchor;
        continue;
      }
      if (forwardCursor) {
        packageAssignmentBySlotId.set(slot.id, forwardCursor);
      }
    }
  }

  return input.events.map((event) => {
    const linked = byId.get(event.id) ?? { price: 0, sourcePaymentLinkId: null };
    const salary = Math.max(0, roundRub(toNumber(event.teacher_rate_rub)));
    const money = calculateLentaMoney({
      lessonPrice: Math.max(0, linked.price),
      salary,
      settings: input.settings
    });
    const isOldStudent = isOldStudentName(event.student_name);
    const yulia = isOldStudent ? money.dividends : money.yulia;
    const stas = isOldStudent ? 0 : money.stas;
    const packageAssignment = packageAssignmentBySlotId.get(event.id);

    return {
      id: event.id,
      eventNumber: event.event_number,
      lessonDate: event.date,
      lessonTime: event.start_time.slice(0, 5),
      teacherId: event.teacher_id,
      teacherName: event.teacher_name,
      studentId: event.student_id,
      studentName: event.student_name,
      status: event.status,
      statusLabel: getLentaStatusLabel(event.status),
      isCompleted: event.status === 'completed',
      remainingPaidLessons: packageAssignment ? Math.max(0, packageAssignment.remaining) : null,
      remainingPaidLessonsPaidAt: packageAssignment?.paidAt ?? null,
      sourcePaymentLinkId: packageAssignment?.paymentLinkId ?? linked.sourcePaymentLinkId,
      rescheduleTargetDate: event.reschedule_target_date,
      rescheduleTargetTime: event.reschedule_target_time ? event.reschedule_target_time.slice(0, 5) : null,
      rescheduleSourceDate: event.reschedule_source_date,
      rescheduleSourceTime: event.reschedule_source_time ? event.reschedule_source_time.slice(0, 5) : null,
      isOldStudent,
      ...money,
      yulia,
      stas
    };
  });
}

export async function getLentaSettings(): Promise<LentaSettings> {
  const pool = getPool();
  let rows: mysql.RowDataPacket[] = [];
  try {
    const [result] = await pool.query<mysql.RowDataPacket[]>(
      `
        SELECT
          acquiring_percent,
          tax_percent,
          fund_development_percent,
          fund_safety_percent,
          fund_dividends_percent
        FROM lenta_settings
        WHERE id = 1
        LIMIT 1
      `
    );
    rows = result;
  } catch (error) {
    if (isMysqlTableMissingError(error)) {
      return DEFAULT_LENTA_SETTINGS;
    }
    throw error;
  }

  if (rows.length === 0) {
    return DEFAULT_LENTA_SETTINGS;
  }

  return {
    acquiringPercent: toNumber(rows[0].acquiring_percent),
    taxPercent: toNumber(rows[0].tax_percent),
    fundDevelopmentPercent: toNumber(rows[0].fund_development_percent),
    fundSafetyPercent: toNumber(rows[0].fund_safety_percent),
    fundDividendsPercent: toNumber(rows[0].fund_dividends_percent)
  };
}

export function validateLentaSettings(input: LentaSettings): void {
  const values = [
    input.acquiringPercent,
    input.taxPercent,
    input.fundDevelopmentPercent,
    input.fundSafetyPercent,
    input.fundDividendsPercent
  ];

  for (const value of values) {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new Error('INVALID_PERCENT');
    }
  }

  const fundsSum = input.fundDevelopmentPercent + input.fundSafetyPercent + input.fundDividendsPercent;
  if (Math.abs(fundsSum - 100) > 0.0001) {
    throw new Error('INVALID_FUNDS_SUM');
  }
}

export async function updateLentaSettings(input: LentaSettings): Promise<LentaSettings> {
  validateLentaSettings(input);

  const pool = getPool();
  await ensureLentaSettingsTable();
  await pool.query(
    `
      INSERT INTO lenta_settings (
        id,
        acquiring_percent,
        tax_percent,
        fund_development_percent,
        fund_safety_percent,
        fund_dividends_percent
      )
      VALUES (1, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        acquiring_percent = VALUES(acquiring_percent),
        tax_percent = VALUES(tax_percent),
        fund_development_percent = VALUES(fund_development_percent),
        fund_safety_percent = VALUES(fund_safety_percent),
        fund_dividends_percent = VALUES(fund_dividends_percent)
    `,
    [
      input.acquiringPercent,
      input.taxPercent,
      input.fundDevelopmentPercent,
      input.fundSafetyPercent,
      input.fundDividendsPercent
    ]
  );

  return input;
}

export async function listLentaEvents(input: LentaFilters & { offset: number; limit: number }): Promise<LentaListResult> {
  const settings = await getLentaSettings();
  const rawEvents = await listRawEvents(input);
  const uniqueStudentIds = Array.from(new Set(rawEvents.map((row) => row.student_id)));
  const packageByStudentId = await listPaidPackages(uniqueStudentIds);
  const enriched = enrichWithFinancials({
    events: rawEvents,
    packageByStudentId,
    settings
  });
  const page = enriched.slice(input.offset, input.offset + input.limit);

  const teachersMap = new Map<string, string>();
  const studentsMap = new Map<string, string>();

  for (const row of rawEvents) {
    teachersMap.set(row.teacher_id, row.teacher_name);
    studentsMap.set(row.student_id, row.student_name);
  }

  return {
    items: page,
    totalCount: enriched.length,
    nextOffset: input.offset + input.limit < enriched.length ? input.offset + input.limit : null,
    totals: buildLentaTotals(enriched),
    teachers: Array.from(teachersMap.entries()).map(([id, name]) => ({ id, name })),
    students: Array.from(studentsMap.entries()).map(([id, name]) => ({ id, name }))
  };
}

import { randomUUID } from 'crypto';
import mysql from 'mysql2/promise';
import { getMysqlPool } from '@/lib/mysql-pool';
import {
  createDefaultInstructionDoc,
  createDefaultInstructionHtml,
  ensureUniqueSlug,
  getInstructionTitleFromDoc,
  parseOldSlugs,
  safeParseInstructionJson,
  slugifyInstructionTitle,
  type InstructionStatus,
  type TiptapJsonContent
} from '@/lib/instructions';

export type InstructionListItem = {
  id: string;
  slug: string;
  title: string;
  status: InstructionStatus;
  updatedAt: string;
};

export type InstructionDetail = {
  id: string;
  slug: string;
  title: string;
  status: InstructionStatus;
  contentJson: TiptapJsonContent;
  contentHtml: string;
  oldSlugs: string[];
  createdBy: string;
  updatedBy: string;
  updatedAt: string;
};

export type InstructionAccessView = {
  instruction: InstructionDetail;
  redirectedFromSlug: string | null;
  unavailable: boolean;
  notFound: boolean;
};

export type InstructionTeacherAckItem = {
  teacherId: string;
  fullName: string;
  acknowledgedAt: string | null;
};

const LIST_COLUMNS = `
  i.id,
  i.slug,
  i.title,
  i.status,
  i.updated_at
`;

function getPool() {
  return getMysqlPool();
}

function rowToInstructionListItem(row: mysql.RowDataPacket): InstructionListItem {
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    status: row.status === 'published' ? 'published' : 'draft',
    updatedAt: String(row.updated_at)
  };
}

function rowToInstructionDetail(row: mysql.RowDataPacket): InstructionDetail {
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    status: row.status === 'published' ? 'published' : 'draft',
    contentJson: safeParseInstructionJson(row.content_json),
    contentHtml: String(row.content_html ?? ''),
    oldSlugs: parseOldSlugs(row.old_slugs_json),
    createdBy: String(row.created_by),
    updatedBy: String(row.updated_by),
    updatedAt: String(row.updated_at)
  };
}

export async function listInstructionsForRole(role: 'admin' | 'teacher'): Promise<InstructionListItem[]> {
  const whereClause = role === 'admin' ? '' : `WHERE i.status = 'published'`;
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT ${LIST_COLUMNS}
      FROM instructions i
      ${whereClause}
      ORDER BY i.updated_at DESC
    `
  );

  return rows.map(rowToInstructionListItem);
}

export async function findInstructionBySlug(slug: string): Promise<InstructionDetail | null> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT
        i.id,
        i.slug,
        i.title,
        i.status,
        i.content_json,
        i.content_html,
        i.old_slugs_json,
        i.created_by,
        i.updated_by,
        i.updated_at
      FROM instructions i
      WHERE i.slug = ?
      LIMIT 1
    `,
    [slug]
  );

  if (rows.length === 0) return null;
  return rowToInstructionDetail(rows[0]);
}

export async function findInstructionBySlugOrLegacy(slug: string): Promise<{ instruction: InstructionDetail; redirectedFromSlug: string | null } | null> {
  const direct = await findInstructionBySlug(slug);
  if (direct) return { instruction: direct, redirectedFromSlug: null };

  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT
        i.id,
        i.slug,
        i.title,
        i.status,
        i.content_json,
        i.content_html,
        i.old_slugs_json,
        i.created_by,
        i.updated_by,
        i.updated_at
      FROM instructions i
      WHERE JSON_CONTAINS(i.old_slugs_json, JSON_QUOTE(?))
      ORDER BY i.updated_at DESC
      LIMIT 1
    `,
    [slug]
  );

  if (rows.length === 0) return null;
  return { instruction: rowToInstructionDetail(rows[0]), redirectedFromSlug: slug };
}

export async function findCurrentInstructionSlugByLegacySlug(legacySlug: string): Promise<string | null> {
  const [directRows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT i.slug
      FROM instructions i
      WHERE i.slug = ?
      LIMIT 1
    `,
    [legacySlug]
  );

  if (directRows.length > 0) {
    return String(directRows[0].slug ?? '');
  }

  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT i.slug
      FROM instructions i
      WHERE JSON_CONTAINS(i.old_slugs_json, JSON_QUOTE(?))
      ORDER BY i.updated_at DESC
      LIMIT 1
    `,
    [legacySlug]
  );

  if (rows.length === 0) return null;
  return String(rows[0].slug ?? '');
}

export async function createInstructionDraft(actorUserId: string): Promise<InstructionDetail> {
  const pool = getPool();
  const connection = await pool.getConnection();
  const id = randomUUID();
  const contentJson = createDefaultInstructionDoc();
  const contentHtml = createDefaultInstructionHtml();
  const title = getInstructionTitleFromDoc(contentJson);

  try {
    await connection.beginTransaction();

    const slug = await generateUniqueSlug(connection, slugifyInstructionTitle(title), null);

    await connection.query<mysql.ResultSetHeader>(
      `
        INSERT INTO instructions (
          id,
          slug,
          title,
          status,
          content_json,
          content_html,
          old_slugs_json,
          created_by,
          updated_by
        ) VALUES (?, ?, ?, 'draft', CAST(? AS JSON), ?, CAST(? AS JSON), ?, ?)
      `,
      [id, slug, title, JSON.stringify(contentJson), contentHtml, JSON.stringify([]), actorUserId, actorUserId]
    );

    const row = await getInstructionRowById(connection, id);
    if (!row) throw new Error('INSTRUCTION_CREATE_FAILED');

    await connection.commit();
    return rowToInstructionDetail(row);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateInstructionBySlug(input: {
  slug: string;
  actorUserId: string;
  contentJson: unknown;
  contentHtml: string;
  status: InstructionStatus;
}): Promise<InstructionDetail | null> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      `
        SELECT
          i.id,
          i.slug,
          i.old_slugs_json
        FROM instructions i
        WHERE i.slug = ?
        LIMIT 1
        FOR UPDATE
      `,
      [input.slug]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return null;
    }

    const current = rows[0];
    const instructionId = String(current.id);
    const currentSlug = String(current.slug);
    const oldSlugs = parseOldSlugs(current.old_slugs_json);

    const normalizedJson = safeParseInstructionJson(input.contentJson);
    const nextTitle = getInstructionTitleFromDoc(normalizedJson);
    const baseSlug = slugifyInstructionTitle(nextTitle);
    const nextSlug = await generateUniqueSlug(connection, baseSlug, instructionId);

    const nextOldSlugsSet = new Set(oldSlugs);
    if (nextSlug !== currentSlug) {
      nextOldSlugsSet.add(currentSlug);
    }
    nextOldSlugsSet.delete(nextSlug);

    await connection.query<mysql.ResultSetHeader>(
      `
        UPDATE instructions
        SET
          slug = ?,
          title = ?,
          status = ?,
          content_json = CAST(? AS JSON),
          content_html = ?,
          old_slugs_json = CAST(? AS JSON),
          updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [
        nextSlug,
        nextTitle,
        input.status,
        JSON.stringify(normalizedJson),
        input.contentHtml,
        JSON.stringify(Array.from(nextOldSlugsSet)),
        input.actorUserId,
        instructionId
      ]
    );

    const updatedRow = await getInstructionRowById(connection, instructionId);
    if (!updatedRow) throw new Error('INSTRUCTION_UPDATE_FAILED');

    await connection.commit();
    return rowToInstructionDetail(updatedRow);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateInstructionStatusBySlug(input: {
  slug: string;
  actorUserId: string;
  status: InstructionStatus;
}): Promise<InstructionDetail | null> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      `
        SELECT i.id
        FROM instructions i
        WHERE i.slug = ?
        LIMIT 1
        FOR UPDATE
      `,
      [input.slug]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return null;
    }

    const instructionId = String(rows[0].id);

    await connection.query<mysql.ResultSetHeader>(
      `
        UPDATE instructions
        SET
          status = ?,
          updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [input.status, input.actorUserId, instructionId]
    );

    const updatedRow = await getInstructionRowById(connection, instructionId);
    if (!updatedRow) throw new Error('INSTRUCTION_STATUS_UPDATE_FAILED');

    await connection.commit();
    return rowToInstructionDetail(updatedRow);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function deleteInstructionBySlug(slug: string): Promise<boolean> {
  const [result] = await getPool().query<mysql.ResultSetHeader>(
    `
      DELETE FROM instructions
      WHERE slug = ?
      LIMIT 1
    `,
    [slug]
  );

  return result.affectedRows > 0;
}

export async function resolveInstructionAccessView(input: {
  slug: string;
  role: 'admin' | 'teacher';
}): Promise<InstructionAccessView> {
  const matched = await findInstructionBySlugOrLegacy(input.slug);

  if (!matched) {
    return {
      instruction: null as never,
      redirectedFromSlug: null,
      unavailable: false,
      notFound: true
    };
  }

  const unavailable = input.role !== 'admin' && matched.instruction.status !== 'published';

  return {
    instruction: matched.instruction,
    redirectedFromSlug: matched.redirectedFromSlug,
    unavailable,
    notFound: false
  };
}

export async function findTeacherIdByUserId(userId: string): Promise<string | null> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT t.id
      FROM teachers t
      WHERE t.user_id = ?
        AND t.deleted_at IS NULL
      LIMIT 1
    `,
    [userId]
  );

  if (rows.length === 0) return null;
  return String(rows[0].id);
}

export async function setInstructionAcknowledgementBySlug(input: {
  slug: string;
  teacherId: string;
  acknowledged: boolean;
}): Promise<{ acknowledged: boolean; acknowledgedAt: string | null } | null> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [instructionRows] = await connection.query<mysql.RowDataPacket[]>(
      `
        SELECT id
        FROM instructions
        WHERE slug = ? AND status = 'published'
        LIMIT 1
        FOR UPDATE
      `,
      [input.slug]
    );

    if (instructionRows.length === 0) {
      await connection.rollback();
      return null;
    }

    const instructionId = String(instructionRows[0].id);

    if (input.acknowledged) {
      await connection.query<mysql.ResultSetHeader>(
        `
          INSERT INTO instruction_acknowledgements (instruction_id, teacher_id)
          VALUES (?, ?)
          ON DUPLICATE KEY UPDATE acknowledged_at = CURRENT_TIMESTAMP
        `,
        [instructionId, input.teacherId]
      );
    } else {
      await connection.query<mysql.ResultSetHeader>(
        `
          DELETE FROM instruction_acknowledgements
          WHERE instruction_id = ? AND teacher_id = ?
        `,
        [instructionId, input.teacherId]
      );
    }

    const [ackRows] = await connection.query<mysql.RowDataPacket[]>(
      `
        SELECT acknowledged_at
        FROM instruction_acknowledgements
        WHERE instruction_id = ? AND teacher_id = ?
        LIMIT 1
      `,
      [instructionId, input.teacherId]
    );

    await connection.commit();

    if (ackRows.length === 0) {
      return { acknowledged: false, acknowledgedAt: null };
    }

    return {
      acknowledged: true,
      acknowledgedAt: String(ackRows[0].acknowledged_at)
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getInstructionAcknowledgeStateForTeacher(input: {
  instructionId: string;
  teacherId: string;
}): Promise<{ acknowledged: boolean; acknowledgedAt: string | null }> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT acknowledged_at
      FROM instruction_acknowledgements
      WHERE instruction_id = ? AND teacher_id = ?
      LIMIT 1
    `,
    [input.instructionId, input.teacherId]
  );

  if (rows.length === 0) {
    return { acknowledged: false, acknowledgedAt: null };
  }

  return {
    acknowledged: true,
    acknowledgedAt: String(rows[0].acknowledged_at)
  };
}

export async function listInstructionTeacherAcks(instructionId: string): Promise<InstructionTeacherAckItem[]> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT
        t.id AS teacher_id,
        CONCAT_WS(' ', t.last_name, t.first_name) AS full_name,
        ia.acknowledged_at
      FROM teachers t
      LEFT JOIN instruction_acknowledgements ia
        ON ia.teacher_id = t.id
        AND ia.instruction_id = ?
      WHERE t.deleted_at IS NULL
      ORDER BY
        CASE WHEN ia.acknowledged_at IS NULL THEN 1 ELSE 0 END ASC,
        ia.acknowledged_at DESC,
        t.last_name ASC,
        t.first_name ASC
    `,
    [instructionId]
  );

  return rows.map((row) => ({
    teacherId: String(row.teacher_id),
    fullName: String(row.full_name ?? '').trim(),
    acknowledgedAt: row.acknowledged_at ? String(row.acknowledged_at) : null
  }));
}

export async function listAcknowledgedInstructionIdsForTeacher(teacherId: string): Promise<string[]> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `
      SELECT ia.instruction_id
      FROM instruction_acknowledgements ia
      INNER JOIN instructions i
        ON i.id = ia.instruction_id
      WHERE ia.teacher_id = ?
        AND i.status = 'published'
    `,
    [teacherId]
  );

  return rows.map((row) => String(row.instruction_id));
}

async function getInstructionRowById(connection: mysql.PoolConnection, id: string): Promise<mysql.RowDataPacket | null> {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `
      SELECT
        i.id,
        i.slug,
        i.title,
        i.status,
        i.content_json,
        i.content_html,
        i.old_slugs_json,
        i.created_by,
        i.updated_by,
        i.updated_at
      FROM instructions i
      WHERE i.id = ?
      LIMIT 1
    `,
    [id]
  );

  if (rows.length === 0) return null;
  return rows[0];
}

async function generateUniqueSlug(
  connection: mysql.PoolConnection,
  baseSlug: string,
  excludeInstructionId: string | null
): Promise<string> {
  let suffix = 1;

  while (suffix < 10000) {
    const candidate = ensureUniqueSlug(baseSlug, suffix);
    const isTaken = await isSlugTaken(connection, candidate, excludeInstructionId);
    if (!isTaken) return candidate;
    suffix += 1;
  }

  throw new Error('INSTRUCTION_SLUG_GENERATION_FAILED');
}

async function isSlugTaken(
  connection: mysql.PoolConnection,
  slug: string,
  excludeInstructionId: string | null
): Promise<boolean> {
  if (excludeInstructionId) {
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      `
        SELECT id
        FROM instructions
        WHERE slug = ? AND id <> ?
        LIMIT 1
      `,
      [slug, excludeInstructionId]
    );

    return rows.length > 0;
  }

  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `
      SELECT id
      FROM instructions
      WHERE slug = ?
      LIMIT 1
    `,
    [slug]
  );

  return rows.length > 0;
}

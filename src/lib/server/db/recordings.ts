import type { OrgScopedDb } from "./index.js";
import type { Recording, RecordingStatus, PaginatedResponse } from "../../types/index.js";
import { generateId } from "../../utils/id.js";
import { ID_PREFIX, ErrorCode } from "../../constants.js";
import { HttpError } from "../../utils/response.js";
import {
  parsePaginationParams,
  buildPaginatedQuery,
  processPaginatedResults,
} from "./pagination.js";

/** Valid status transitions for recordings. */
const VALID_TRANSITIONS: Record<RecordingStatus, RecordingStatus[]> = {
  REGISTERED: ["UPLOADING"],
  UPLOADING: ["UPLOADED"],
  UPLOADED: ["PROCESSING"],
  PROCESSING: ["DONE", "PARTIAL", "ERROR"],
  PARTIAL: ["PROCESSING"],
  ERROR: ["PROCESSING"],
  DONE: ["PROCESSING"],
};

export interface CreateRecordingInput {
  deviceId: string | null;
  importBatchId: string;
  originalFileName: string;
  recorderFileCreatedAt?: string | null;
  sizeBytes: number;
  sha256: string;
  mimeType: string;
  needsConversion: boolean;
  rawR2Key: string;
}

export async function create(
  scopedDb: OrgScopedDb,
  input: CreateRecordingInput,
): Promise<Recording> {
  const id = generateId(ID_PREFIX.recording);
  const now = new Date().toISOString();

  await scopedDb.run(
    `INSERT INTO recordings (id, orgId, deviceId, importBatchId, originalFileName, recorderFileCreatedAt, sizeBytes, sha256, mimeType, needsConversion, rawR2Key, status, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'REGISTERED', ?, ?)`,
    id,
    scopedDb.orgId,
    input.deviceId,
    input.importBatchId,
    input.originalFileName,
    input.recorderFileCreatedAt ?? null,
    input.sizeBytes,
    input.sha256,
    input.mimeType,
    input.needsConversion ? 1 : 0,
    input.rawR2Key,
    now,
    now,
  );

  return (await getById(scopedDb, id))!;
}

export async function getById(
  scopedDb: OrgScopedDb,
  id: string,
): Promise<Recording | null> {
  return scopedDb.queryFirst<Recording>(
    `SELECT * FROM recordings WHERE id = ? AND orgId = ?`,
    id,
    scopedDb.orgId,
  );
}

export async function listWithPagination(
  scopedDb: OrgScopedDb,
  params: { limit?: string | number; cursor?: string; sort?: string; status?: string; importBatchId?: string },
): Promise<PaginatedResponse<Recording>> {
  const pagination = parsePaginationParams(params);
  const { whereClause, orderClause, limitClause, cursorParams } =
    buildPaginatedQuery(pagination);

  const conditions = ["orgId = ?"];
  const bindParams: unknown[] = [scopedDb.orgId];

  if (params.status) {
    conditions.push("status = ?");
    bindParams.push(params.status);
  }
  if (params.importBatchId) {
    conditions.push("importBatchId = ?");
    bindParams.push(params.importBatchId);
  }

  const where = `WHERE ${conditions.join(" AND ")} ${whereClause}`;

  const rows = await scopedDb.queryAll<Recording>(
    `SELECT * FROM recordings ${where} ${orderClause} ${limitClause}`,
    ...bindParams,
    ...cursorParams,
  );

  const { data, hasMore, nextCursor } = processPaginatedResults(
    rows,
    pagination.limit,
    pagination.sortField,
  );

  const countResult = await scopedDb.queryFirst<{ count: number }>(
    `SELECT COUNT(*) as count FROM recordings WHERE ${conditions.join(" AND ")}`,
    ...bindParams,
  );

  return {
    data,
    pagination: {
      hasMore,
      nextCursor,
      totalCount: countResult?.count ?? 0,
    },
  };
}

export async function findBySha256(
  scopedDb: OrgScopedDb,
  sha256: string,
): Promise<Recording | null> {
  return scopedDb.queryFirst<Recording>(
    `SELECT * FROM recordings WHERE orgId = ? AND sha256 = ?`,
    scopedDb.orgId,
    sha256,
  );
}

export async function updateStatus(
  scopedDb: OrgScopedDb,
  id: string,
  newStatus: RecordingStatus,
): Promise<Recording> {
  const existing = await getById(scopedDb, id);
  if (!existing) {
    throw new HttpError(404, ErrorCode.NOT_FOUND, `Recording ${id} not found`);
  }

  const allowed = VALID_TRANSITIONS[existing.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new HttpError(
      409,
      ErrorCode.INVALID_STATUS_TRANSITION,
      `Cannot transition from ${existing.status} to ${newStatus}`,
    );
  }

  const now = new Date().toISOString();
  await scopedDb.run(
    `UPDATE recordings SET status = ?, updatedAt = ? WHERE id = ? AND orgId = ?`,
    newStatus,
    now,
    id,
    scopedDb.orgId,
  );

  return (await getById(scopedDb, id))!;
}

export async function update(
  scopedDb: OrgScopedDb,
  id: string,
  fields: Partial<
    Pick<
      Recording,
      | "workshopId"
      | "draftId"
      | "durationMs"
      | "convertedR2Key"
      | "needsConversion"
      | "status"
    >
  >,
): Promise<Recording> {
  const setClauses: string[] = [];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      setClauses.push(`${key} = ?`);
      params.push(value);
    }
  }

  if (setClauses.length === 0) {
    return (await getById(scopedDb, id))!;
  }

  setClauses.push("updatedAt = ?");
  params.push(new Date().toISOString());
  params.push(id, scopedDb.orgId);

  await scopedDb.run(
    `UPDATE recordings SET ${setClauses.join(", ")} WHERE id = ? AND orgId = ?`,
    ...params,
  );

  return (await getById(scopedDb, id))!;
}

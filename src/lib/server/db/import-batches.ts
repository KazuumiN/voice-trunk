import type { OrgScopedDb } from "./index.js";
import type { ImportBatch, ImportBatchStatus, PaginatedResponse } from "../../types/index.js";
import { generateId } from "../../utils/id.js";
import { ID_PREFIX, ErrorCode } from "../../constants.js";
import { HttpError } from "../../utils/response.js";
import {
  parsePaginationParams,
  buildPaginatedQuery,
  processPaginatedResults,
} from "./pagination.js";

export interface CreateImportBatchInput {
  createdBy: string;
  totalFiles: number;
  notes?: string | null;
}

export async function create(
  scopedDb: OrgScopedDb,
  input: CreateImportBatchInput,
): Promise<ImportBatch> {
  const id = generateId(ID_PREFIX.importBatch);
  const now = new Date().toISOString();

  await scopedDb.run(
    `INSERT INTO import_batches (id, orgId, createdBy, startedAt, notes, status, totalFiles, uploadedFiles, errorFiles)
     VALUES (?, ?, ?, ?, ?, 'OPEN', ?, 0, 0)`,
    id,
    scopedDb.orgId,
    input.createdBy,
    now,
    input.notes ?? null,
    input.totalFiles,
  );

  return (await getById(scopedDb, id))!;
}

export async function getById(
  scopedDb: OrgScopedDb,
  id: string,
): Promise<ImportBatch | null> {
  return scopedDb.queryFirst<ImportBatch>(
    `SELECT * FROM import_batches WHERE id = ? AND orgId = ?`,
    id,
    scopedDb.orgId,
  );
}

export async function list(
  scopedDb: OrgScopedDb,
  params: { limit?: string | number; cursor?: string; sort?: string; status?: string },
): Promise<PaginatedResponse<ImportBatch>> {
  const pagination = parsePaginationParams(params);
  const { whereClause, orderClause, limitClause, cursorParams } =
    buildPaginatedQuery(pagination);

  const conditions = ["orgId = ?"];
  const bindParams: unknown[] = [scopedDb.orgId];

  if (params.status) {
    conditions.push("status = ?");
    bindParams.push(params.status);
  }

  const where = `WHERE ${conditions.join(" AND ")} ${whereClause}`;

  const rows = await scopedDb.queryAll<ImportBatch>(
    `SELECT * FROM import_batches ${where} ${orderClause} ${limitClause}`,
    ...bindParams,
    ...cursorParams,
  );

  const { data, hasMore, nextCursor } = processPaginatedResults(
    rows,
    pagination.limit,
    pagination.sortField,
  );

  const countResult = await scopedDb.queryFirst<{ count: number }>(
    `SELECT COUNT(*) as count FROM import_batches WHERE ${conditions.join(" AND ")}`,
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

export async function incrementUploaded(
  scopedDb: OrgScopedDb,
  id: string,
): Promise<ImportBatch> {
  await scopedDb.run(
    `UPDATE import_batches SET uploadedFiles = uploadedFiles + 1 WHERE id = ? AND orgId = ?`,
    id,
    scopedDb.orgId,
  );

  return await maybeComplete(scopedDb, id);
}

export async function incrementError(
  scopedDb: OrgScopedDb,
  id: string,
): Promise<ImportBatch> {
  await scopedDb.run(
    `UPDATE import_batches SET errorFiles = errorFiles + 1 WHERE id = ? AND orgId = ?`,
    id,
    scopedDb.orgId,
  );

  return await maybeComplete(scopedDb, id);
}

export async function updateStatus(
  scopedDb: OrgScopedDb,
  id: string,
  status: ImportBatchStatus,
): Promise<ImportBatch> {
  const batch = await getById(scopedDb, id);
  if (!batch) {
    throw new HttpError(404, ErrorCode.NOT_FOUND, `Import batch ${id} not found`);
  }

  const now = new Date().toISOString();
  const endedAt =
    status === "COMPLETED" || status === "PARTIAL_ERROR" ? now : null;

  await scopedDb.run(
    `UPDATE import_batches SET status = ?, endedAt = COALESCE(?, endedAt) WHERE id = ? AND orgId = ?`,
    status,
    endedAt,
    id,
    scopedDb.orgId,
  );

  return (await getById(scopedDb, id))!;
}

/**
 * Check if batch is complete (uploadedFiles + errorFiles = totalFiles) and update status.
 */
async function maybeComplete(
  scopedDb: OrgScopedDb,
  id: string,
): Promise<ImportBatch> {
  const batch = await getById(scopedDb, id);
  if (!batch) {
    throw new HttpError(404, ErrorCode.NOT_FOUND, `Import batch ${id} not found`);
  }

  if (batch.uploadedFiles + batch.errorFiles >= batch.totalFiles) {
    const newStatus: ImportBatchStatus =
      batch.errorFiles > 0 ? "PARTIAL_ERROR" : "COMPLETED";
    return updateStatus(scopedDb, id, newStatus);
  }

  return batch;
}

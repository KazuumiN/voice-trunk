import type { OrgScopedDb } from "./index.js";
import type {
  WorkshopDraft,
  Workshop,
  PaginatedResponse,
} from "../../types/index.js";
import { generateId } from "../../utils/id.js";
import { ID_PREFIX, ErrorCode } from "../../constants.js";
import { HttpError } from "../../utils/response.js";
import { create as createWorkshop } from "./workshops.js";
import {
  parsePaginationParams,
  buildPaginatedQuery,
  processPaginatedResults,
} from "./pagination.js";

export interface CreateWorkshopDraftInput {
  importBatchId: string;
  title?: string | null;
  confidenceScore?: number;
  reason?: string | null;
}

export async function create(
  scopedDb: OrgScopedDb,
  input: CreateWorkshopDraftInput,
): Promise<WorkshopDraft> {
  const id = generateId(ID_PREFIX.workshopDraft);
  const now = new Date().toISOString();

  await scopedDb.run(
    `INSERT INTO workshop_drafts (id, orgId, importBatchId, status, title, confidenceScore, reason, createdAt, updatedAt)
     VALUES (?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?)`,
    id,
    scopedDb.orgId,
    input.importBatchId,
    input.title ?? null,
    input.confidenceScore ?? 0.0,
    input.reason ?? null,
    now,
    now,
  );

  return (await getById(scopedDb, id))!;
}

export async function getById(
  scopedDb: OrgScopedDb,
  id: string,
): Promise<WorkshopDraft | null> {
  return scopedDb.queryFirst<WorkshopDraft>(
    `SELECT * FROM workshop_drafts WHERE id = ? AND orgId = ?`,
    id,
    scopedDb.orgId,
  );
}

export async function list(
  scopedDb: OrgScopedDb,
  params: {
    limit?: string | number;
    cursor?: string;
    sort?: string;
    importBatchId?: string;
    status?: string;
  },
): Promise<PaginatedResponse<WorkshopDraft>> {
  const pagination = parsePaginationParams(params);
  const { whereClause, orderClause, limitClause, cursorParams } =
    buildPaginatedQuery(pagination);

  const conditions = ["orgId = ?"];
  const bindParams: unknown[] = [scopedDb.orgId];

  if (params.importBatchId) {
    conditions.push("importBatchId = ?");
    bindParams.push(params.importBatchId);
  }
  if (params.status) {
    conditions.push("status = ?");
    bindParams.push(params.status);
  }

  const where = `WHERE ${conditions.join(" AND ")} ${whereClause}`;

  const rows = await scopedDb.queryAll<WorkshopDraft>(
    `SELECT * FROM workshop_drafts ${where} ${orderClause} ${limitClause}`,
    ...bindParams,
    ...cursorParams,
  );

  const { data, hasMore, nextCursor } = processPaginatedResults(
    rows,
    pagination.limit,
    pagination.sortField,
  );

  const countResult = await scopedDb.queryFirst<{ count: number }>(
    `SELECT COUNT(*) as count FROM workshop_drafts WHERE ${conditions.join(" AND ")}`,
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

/**
 * Confirm a draft: transitions DRAFT -> CONFIRMED, creates a Workshop, and links recordings.
 */
export async function confirm(
  scopedDb: OrgScopedDb,
  draftId: string,
  workshopInput: { title: string; date: string; location: string; createdBy: string },
): Promise<{ draft: WorkshopDraft; workshop: Workshop }> {
  const draft = await getById(scopedDb, draftId);
  if (!draft) {
    throw new HttpError(404, ErrorCode.NOT_FOUND, `Workshop draft ${draftId} not found`);
  }
  if (draft.status !== "DRAFT") {
    throw new HttpError(
      409,
      ErrorCode.INVALID_STATUS_TRANSITION,
      `Cannot confirm draft with status ${draft.status}`,
    );
  }

  const workshop = await createWorkshop(scopedDb, workshopInput);

  const now = new Date().toISOString();
  await scopedDb.run(
    `UPDATE workshop_drafts SET status = 'CONFIRMED', confirmedWorkshopId = ?, updatedAt = ? WHERE id = ? AND orgId = ?`,
    workshop.id,
    now,
    draftId,
    scopedDb.orgId,
  );

  // Link all recordings that pointed to this draft to the confirmed workshop
  await scopedDb.run(
    `UPDATE recordings SET workshopId = ?, updatedAt = ? WHERE draftId = ? AND orgId = ?`,
    workshop.id,
    now,
    draftId,
    scopedDb.orgId,
  );

  const updatedDraft = (await getById(scopedDb, draftId))!;
  return { draft: updatedDraft, workshop };
}

/**
 * Merge a draft into another draft.
 */
export async function merge(
  scopedDb: OrgScopedDb,
  sourceDraftId: string,
  targetDraftId: string,
): Promise<WorkshopDraft> {
  const source = await getById(scopedDb, sourceDraftId);
  if (!source) {
    throw new HttpError(404, ErrorCode.NOT_FOUND, `Workshop draft ${sourceDraftId} not found`);
  }
  if (source.status !== "DRAFT") {
    throw new HttpError(
      409,
      ErrorCode.INVALID_STATUS_TRANSITION,
      `Cannot merge draft with status ${source.status}`,
    );
  }

  const target = await getById(scopedDb, targetDraftId);
  if (!target) {
    throw new HttpError(404, ErrorCode.NOT_FOUND, `Target workshop draft ${targetDraftId} not found`);
  }

  const now = new Date().toISOString();

  // Mark source as merged
  await scopedDb.run(
    `UPDATE workshop_drafts SET status = 'MERGED', mergedIntoId = ?, updatedAt = ? WHERE id = ? AND orgId = ?`,
    targetDraftId,
    now,
    sourceDraftId,
    scopedDb.orgId,
  );

  // Move recordings from source to target draft
  await scopedDb.run(
    `UPDATE recordings SET draftId = ?, updatedAt = ? WHERE draftId = ? AND orgId = ?`,
    targetDraftId,
    now,
    sourceDraftId,
    scopedDb.orgId,
  );

  return (await getById(scopedDb, sourceDraftId))!;
}

/**
 * Discard a draft.
 */
export async function discard(
  scopedDb: OrgScopedDb,
  draftId: string,
): Promise<WorkshopDraft> {
  const draft = await getById(scopedDb, draftId);
  if (!draft) {
    throw new HttpError(404, ErrorCode.NOT_FOUND, `Workshop draft ${draftId} not found`);
  }
  if (draft.status !== "DRAFT") {
    throw new HttpError(
      409,
      ErrorCode.INVALID_STATUS_TRANSITION,
      `Cannot discard draft with status ${draft.status}`,
    );
  }

  const now = new Date().toISOString();
  await scopedDb.run(
    `UPDATE workshop_drafts SET status = 'DISCARDED', updatedAt = ? WHERE id = ? AND orgId = ?`,
    now,
    draftId,
    scopedDb.orgId,
  );

  // Unlink recordings from this draft
  await scopedDb.run(
    `UPDATE recordings SET draftId = NULL, updatedAt = ? WHERE draftId = ? AND orgId = ?`,
    now,
    draftId,
    scopedDb.orgId,
  );

  return (await getById(scopedDb, draftId))!;
}

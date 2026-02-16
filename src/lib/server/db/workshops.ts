import type { OrgScopedDb } from "./index.js";
import type { Workshop, PaginatedResponse } from "../../types/index.js";
import { generateId } from "../../utils/id.js";
import { ID_PREFIX } from "../../constants.js";
import {
  parsePaginationParams,
  buildPaginatedQuery,
  processPaginatedResults,
} from "./pagination.js";

export interface CreateWorkshopInput {
  title: string;
  date: string;
  location: string;
  agendaR2Key?: string | null;
  createdBy: string;
}

export async function create(
  scopedDb: OrgScopedDb,
  input: CreateWorkshopInput,
): Promise<Workshop> {
  const id = generateId(ID_PREFIX.workshop);
  const now = new Date().toISOString();

  await scopedDb.run(
    `INSERT INTO workshops (id, orgId, title, date, location, agendaR2Key, createdBy, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    scopedDb.orgId,
    input.title,
    input.date,
    input.location,
    input.agendaR2Key ?? null,
    input.createdBy,
    now,
  );

  return (await getById(scopedDb, id))!;
}

export async function getById(
  scopedDb: OrgScopedDb,
  id: string,
): Promise<Workshop | null> {
  return scopedDb.queryFirst<Workshop>(
    `SELECT * FROM workshops WHERE id = ? AND orgId = ?`,
    id,
    scopedDb.orgId,
  );
}

export async function list(
  scopedDb: OrgScopedDb,
  params: { limit?: string | number; cursor?: string; sort?: string },
): Promise<PaginatedResponse<Workshop>> {
  const pagination = parsePaginationParams(params);
  const { whereClause, orderClause, limitClause, cursorParams } =
    buildPaginatedQuery(pagination);

  const rows = await scopedDb.queryAll<Workshop>(
    `SELECT * FROM workshops WHERE orgId = ? ${whereClause} ${orderClause} ${limitClause}`,
    scopedDb.orgId,
    ...cursorParams,
  );

  const { data, hasMore, nextCursor } = processPaginatedResults(
    rows,
    pagination.limit,
    pagination.sortField,
  );

  const countResult = await scopedDb.queryFirst<{ count: number }>(
    `SELECT COUNT(*) as count FROM workshops WHERE orgId = ?`,
    scopedDb.orgId,
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

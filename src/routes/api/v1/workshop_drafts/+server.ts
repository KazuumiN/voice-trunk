import {
  withAuth,
  parsePaginationParams,
  getFilters,
  decodeCursorParam,
  encodeCursor,
} from "$lib/server/api/middleware.js";
import { jsonResponse } from "$lib/utils/response.js";
import type { RequestHandler } from "./$types.js";

export const GET: RequestHandler = withAuth(async ({ request, platform, org }) => {
  const env = platform.env;
  const url = new URL(request.url);
  const { limit, cursor, sort } = parsePaginationParams(url);
  const filters = getFilters(url, ["status", "importBatchId"]);

  const conditions: string[] = ["orgId = ?"];
  const bindings: unknown[] = [org.orgId];

  if (filters.status) {
    conditions.push("status = ?");
    bindings.push(filters.status);
  }
  if (filters.importBatchId) {
    conditions.push("importBatchId = ?");
    bindings.push(filters.importBatchId);
  }

  const [sortField, sortDir] = sort.split(":");
  const safeField = ["createdAt", "updatedAt", "confidenceScore"].includes(
    sortField,
  )
    ? sortField
    : "createdAt";
  const safeDir = sortDir === "asc" ? "ASC" : "DESC";

  // Cursor decode (throws 400 on invalid)
  const cursorData = decodeCursorParam(cursor);
  if (cursorData) {
    const op = safeDir === "DESC" ? "<" : ">";
    conditions.push(
      `(${safeField} ${op} ? OR (${safeField} = ? AND id ${op} ?))`,
    );
    bindings.push(cursorData.sortValue, cursorData.sortValue, cursorData.id);
  }

  const whereClause = conditions.join(" AND ");

  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM workshop_drafts WHERE ${whereClause}`,
  )
    .bind(...bindings)
    .first<{ count: number }>();

  const results = await env.DB.prepare(
    `SELECT * FROM workshop_drafts WHERE ${whereClause} ORDER BY ${safeField} ${safeDir}, id ${safeDir} LIMIT ?`,
  )
    .bind(...bindings, limit + 1)
    .all();

  const hasMore = results.results.length > limit;
  const items = hasMore ? results.results.slice(0, limit) : results.results;

  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1];
    nextCursor = encodeCursor(String(last[safeField]), String(last.id));
  }

  return jsonResponse({
    data: items,
    pagination: {
      hasMore,
      nextCursor,
      totalCount: countResult?.count ?? 0,
    },
  });
}) as RequestHandler;

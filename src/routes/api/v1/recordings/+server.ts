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
  const filters = getFilters(url, [
    "status",
    "workshopId",
    "deviceId",
    "batchId",
    "draftId",
  ]);

  // Build WHERE clause
  const conditions: string[] = ["r.orgId = ?"];
  const bindings: unknown[] = [org.orgId];

  if (filters.status) {
    conditions.push("r.status = ?");
    bindings.push(filters.status);
  }
  if (filters.workshopId) {
    conditions.push("r.workshopId = ?");
    bindings.push(filters.workshopId);
  }
  if (filters.deviceId) {
    conditions.push("r.deviceId = ?");
    bindings.push(filters.deviceId);
  }
  if (filters.batchId) {
    conditions.push("r.importBatchId = ?");
    bindings.push(filters.batchId);
  }
  if (filters.draftId) {
    conditions.push("r.draftId = ?");
    bindings.push(filters.draftId);
  }

  // Parse sort
  const [sortField, sortDir] = sort.split(":");
  const validSortFields = [
    "createdAt",
    "recorderFileCreatedAt",
    "originalFileName",
  ];
  const safeField = validSortFields.includes(sortField)
    ? sortField
    : "createdAt";
  const safeDir = sortDir === "asc" ? "ASC" : "DESC";

  // Cursor decode (throws 400 on invalid)
  const cursorData = decodeCursorParam(cursor);
  if (cursorData) {
    const op = safeDir === "DESC" ? "<" : ">";
    conditions.push(
      `(r.${safeField} ${op} ? OR (r.${safeField} = ? AND r.id ${op} ?))`,
    );
    bindings.push(cursorData.sortValue, cursorData.sortValue, cursorData.id);
  }

  const whereClause = conditions.join(" AND ");

  // Count
  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM recordings r WHERE ${whereClause}`,
  )
    .bind(...bindings)
    .first<{ count: number }>();

  // Fetch
  const results = await env.DB.prepare(
    `SELECT r.*, d.label as deviceLabel FROM recordings r LEFT JOIN devices d ON r.deviceId = d.id AND d.orgId = r.orgId WHERE ${whereClause} ORDER BY r.${safeField} ${safeDir}, r.id ${safeDir} LIMIT ?`,
  )
    .bind(...bindings, limit + 1)
    .all();

  const hasMore = results.results.length > limit;
  const items = hasMore ? results.results.slice(0, limit) : results.results;

  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1];
    nextCursor = encodeCursor(
      String(last[safeField]),
      String(last.id),
    );
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

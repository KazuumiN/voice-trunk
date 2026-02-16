import {
  withAuth,
  parsePaginationParams,
  getFilters,
  decodeCursorParam,
  encodeCursor,
  validateBody,
  requireString,
} from "$lib/server/api/middleware.js";
import { jsonResponse } from "$lib/utils/response.js";
import { generateId } from "$lib/utils/id.js";
import { ID_PREFIX } from "$lib/constants.js";
import type { RequestHandler } from "./$types.js";

export const GET: RequestHandler = withAuth(async ({ request, platform, org }) => {
  const env = platform.env;
  const url = new URL(request.url);
  const { limit, cursor, sort } = parsePaginationParams(url);
  const filters = getFilters(url, ["dateFrom", "dateTo", "location", "title"]);

  const conditions: string[] = ["orgId = ?"];
  const bindings: unknown[] = [org.orgId];

  if (filters.dateFrom) {
    conditions.push("date >= ?");
    bindings.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    conditions.push("date <= ?");
    bindings.push(filters.dateTo);
  }
  if (filters.location) {
    conditions.push("location LIKE ?");
    bindings.push(`%${filters.location}%`);
  }
  if (filters.title) {
    conditions.push("title LIKE ?");
    bindings.push(`%${filters.title}%`);
  }

  const [sortField, sortDir] = sort.split(":");
  const safeField = ["createdAt", "date", "title"].includes(sortField)
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
    `SELECT COUNT(*) as count FROM workshops WHERE ${whereClause}`,
  )
    .bind(...bindings)
    .first<{ count: number }>();

  const results = await env.DB.prepare(
    `SELECT * FROM workshops WHERE ${whereClause} ORDER BY ${safeField} ${safeDir}, id ${safeDir} LIMIT ?`,
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

export const POST: RequestHandler = withAuth(async ({ request, platform, org }) => {
  const env = platform.env;

  const body = await validateBody(request, (b) => {
    const obj = b as Record<string, unknown>;
    return {
      title: requireString(obj, "title"),
      date: requireString(obj, "date"),
      location: requireString(obj, "location"),
    };
  });

  const id = generateId(ID_PREFIX.workshop);
  await env.DB.prepare(
    `INSERT INTO workshops (id, orgId, title, date, location, createdBy, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
  )
    .bind(id, org.orgId, body.title, body.date, body.location, org.userId ?? "service")
    .run();

  const workshop = await env.DB.prepare(
    "SELECT * FROM workshops WHERE id = ? AND orgId = ?",
  )
    .bind(id, org.orgId)
    .first();

  return jsonResponse(workshop, 201);
}) as RequestHandler;

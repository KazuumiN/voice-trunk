import { PAGINATION } from "../../constants.js";

export interface CursorData {
  sortValue: string;
  id: string;
}

export function encodeCursor(sortValue: string, id: string): string {
  return btoa(JSON.stringify({ sortValue, id }));
}

export function decodeCursor(cursor: string): CursorData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(atob(cursor));
  } catch {
    throw new Error("Invalid cursor");
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).sortValue !== "string" ||
    typeof (parsed as Record<string, unknown>).id !== "string"
  ) {
    throw new Error("Invalid cursor structure");
  }
  return parsed as CursorData;
}

export interface ParsedPagination {
  limit: number;
  cursor: CursorData | null;
  sortField: string;
  sortDir: "ASC" | "DESC";
}

export function parsePaginationParams(params: {
  limit?: string | number | null;
  cursor?: string | null;
  sort?: string | null;
}): ParsedPagination {
  let limit = PAGINATION.DEFAULT_LIMIT;
  if (params.limit != null) {
    const parsed =
      typeof params.limit === "number"
        ? params.limit
        : parseInt(params.limit, 10);
    if (!isNaN(parsed) && parsed > 0) {
      limit = Math.min(parsed, PAGINATION.MAX_LIMIT);
    }
  }

  let cursor: CursorData | null = null;
  if (params.cursor) {
    cursor = decodeCursor(params.cursor);
  }

  const sortStr = params.sort || PAGINATION.DEFAULT_SORT;
  const [sortField, sortDirStr] = sortStr.split(":");
  const sortDir =
    sortDirStr?.toLowerCase() === "asc" ? ("ASC" as const) : ("DESC" as const);

  return { limit, cursor, sortField, sortDir };
}

/**
 * Build a paginated query with cursor-based pagination.
 * Returns the WHERE clause fragment and bind params to append.
 */
export function buildPaginatedQuery(opts: {
  sortField: string;
  sortDir: "ASC" | "DESC";
  cursor: CursorData | null;
  limit: number;
}): {
  whereClause: string;
  orderClause: string;
  limitClause: string;
  cursorParams: unknown[];
} {
  const { sortField, sortDir, cursor, limit } = opts;
  const op = sortDir === "DESC" ? "<" : ">";

  let whereClause = "";
  const cursorParams: unknown[] = [];

  if (cursor) {
    whereClause = `AND (${sortField} ${op} ? OR (${sortField} = ? AND id ${op} ?))`;
    cursorParams.push(cursor.sortValue, cursor.sortValue, cursor.id);
  }

  const orderClause = `ORDER BY ${sortField} ${sortDir}, id ${sortDir}`;
  const limitClause = `LIMIT ?`;
  cursorParams.push(limit + 1); // fetch one extra to check hasMore

  return { whereClause, orderClause, limitClause, cursorParams };
}

/**
 * Process paginated results: trim the extra row and build pagination metadata.
 */
export function processPaginatedResults<T extends { id: string }>(
  rows: T[],
  limit: number,
  sortField: string,
): {
  data: T[];
  hasMore: boolean;
  nextCursor: string | null;
} {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const lastRow = data[data.length - 1];
  const nextCursor =
    hasMore && lastRow
      ? encodeCursor(
          String((lastRow as Record<string, unknown>)[sortField]),
          lastRow.id,
        )
      : null;

  return { data, hasMore, nextCursor };
}

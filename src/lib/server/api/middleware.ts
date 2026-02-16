import { PAGINATION } from "../../constants.js";
import { HttpError, handleError } from "../../utils/response.js";
import { resolveOrg, type OrgContext } from "../auth/resolve-org.js";
import {
  decodeCursor,
  encodeCursor,
  type CursorData,
} from "../db/pagination.js";

export { encodeCursor, type CursorData } from "../db/pagination.js";

export interface AuthenticatedEvent {
  request: Request;
  platform: App.Platform;
  params: Record<string, string>;
  org: OrgContext;
}

type HandlerFn = (event: AuthenticatedEvent) => Promise<Response>;

/**
 * Wraps a handler with authentication, resolving orgId from JWT/Service Token.
 */
export function withAuth(handler: HandlerFn) {
  return async (event: {
    request: Request;
    platform?: App.Platform;
    params: Record<string, string>;
  }): Promise<Response> => {
    try {
      const platform = event.platform;
      if (!platform) {
        throw new HttpError(500, "INTERNAL_ERROR", "Platform not available");
      }
      const env = platform.env;
      const org = await resolveOrg(
        event.request,
        env.DB,
        env.CF_ACCESS_TEAM_DOMAIN,
        env.CF_ACCESS_AUD,
      );
      return await handler({ ...event, platform, org });
    } catch (err) {
      return handleError(err);
    }
  };
}

/**
 * Parse pagination params from URL search params.
 */
export function parsePaginationParams(url: URL): {
  limit: number;
  cursor?: string;
  sort: string;
} {
  const limitStr = url.searchParams.get("limit");
  let limit = limitStr ? parseInt(limitStr, 10) : PAGINATION.DEFAULT_LIMIT;
  if (isNaN(limit) || limit < 1) limit = PAGINATION.DEFAULT_LIMIT;
  if (limit > PAGINATION.MAX_LIMIT) limit = PAGINATION.MAX_LIMIT;

  const cursor = url.searchParams.get("cursor") || undefined;
  const sort = url.searchParams.get("sort") || PAGINATION.DEFAULT_SORT;

  return { limit, cursor, sort };
}

/**
 * Parse and validate JSON body from request.
 */
export async function validateBody<T>(
  request: Request,
  validate: (body: unknown) => T,
): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, "VALIDATION_ERROR", "Invalid JSON body");
  }
  return validate(body);
}

/**
 * Get a required string field from an object, throwing if missing.
 */
export function requireString(
  obj: Record<string, unknown>,
  field: string,
): string {
  const val = obj[field];
  if (typeof val !== "string" || val.length === 0) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      `Field '${field}' is required and must be a non-empty string`,
    );
  }
  return val;
}

/**
 * Get a required number field from an object.
 */
export function requireNumber(
  obj: Record<string, unknown>,
  field: string,
): number {
  const val = obj[field];
  if (typeof val !== "number" || isNaN(val)) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      `Field '${field}' is required and must be a number`,
    );
  }
  return val;
}

/**
 * Decode a cursor query parameter, throwing HttpError(400) on invalid input.
 * Returns null if no cursor is provided.
 */
export function decodeCursorParam(cursor: string | undefined): CursorData | null {
  if (!cursor) return null;
  try {
    return decodeCursor(cursor);
  } catch {
    throw new HttpError(400, "VALIDATION_ERROR", "Invalid pagination cursor");
  }
}

/**
 * Get URL search param filters.
 */
export function getFilters(
  url: URL,
  allowedFields: string[],
): Record<string, string> {
  const filters: Record<string, string> = {};
  for (const field of allowedFields) {
    const val = url.searchParams.get(field);
    if (val) filters[field] = val;
  }
  return filters;
}

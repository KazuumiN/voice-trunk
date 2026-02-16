import { withAuth } from "$lib/server/api/middleware.js";
import { HttpError, jsonResponse } from "$lib/utils/response.js";
import type { RequestHandler } from "./$types.js";

export const GET: RequestHandler = withAuth(async ({ platform, org, params }) => {
  const env = platform.env;

  const workshop = await env.DB.prepare(
    "SELECT * FROM workshops WHERE id = ? AND orgId = ?",
  )
    .bind(params.id, org.orgId)
    .first();

  if (!workshop) {
    throw new HttpError(404, "NOT_FOUND", "Workshop not found");
  }

  return jsonResponse(workshop);
}) as RequestHandler;

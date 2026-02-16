import { withAuth } from "$lib/server/api/middleware.js";
import { HttpError, jsonResponse } from "$lib/utils/response.js";
import type { RequestHandler } from "./$types.js";

export const GET: RequestHandler = withAuth(async ({ platform, org, params }) => {
  const env = platform.env;

  const draft = await env.DB.prepare(
    "SELECT * FROM workshop_drafts WHERE id = ? AND orgId = ?",
  )
    .bind(params.id, org.orgId)
    .first();

  if (!draft) {
    throw new HttpError(404, "NOT_FOUND", "Workshop draft not found");
  }

  return jsonResponse(draft);
}) as RequestHandler;

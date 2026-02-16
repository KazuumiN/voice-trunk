import { withAuth } from "$lib/server/api/middleware.js";
import { jsonResponse, HttpError } from "$lib/utils/response.js";
import type { RequestHandler } from "./$types.js";

export const DELETE: RequestHandler = withAuth(async ({ params, platform, org }) => {
  const env = platform.env;
  const tokenId = params.id;

  const existing = await env.DB.prepare(
    "SELECT id FROM service_tokens WHERE id = ? AND orgId = ? AND revokedAt IS NULL",
  )
    .bind(tokenId, org.orgId)
    .first();

  if (!existing) {
    throw new HttpError(404, "NOT_FOUND", "Service token not found");
  }

  await env.DB.prepare(
    "UPDATE service_tokens SET revokedAt = datetime('now') WHERE id = ? AND orgId = ?",
  )
    .bind(tokenId, org.orgId)
    .run();

  return jsonResponse({ id: tokenId, revoked: true });
}) as RequestHandler;

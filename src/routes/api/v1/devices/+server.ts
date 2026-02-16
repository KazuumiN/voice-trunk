import { withAuth } from "$lib/server/api/middleware.js";
import { jsonResponse } from "$lib/utils/response.js";
import type { RequestHandler } from "./$types.js";

export const GET: RequestHandler = withAuth(async ({ platform, org }) => {
  const env = platform.env;
  const results = await env.DB.prepare(
    "SELECT id, label, expectedIdentifierFileName, status, createdAt FROM devices WHERE orgId = ? ORDER BY label ASC",
  )
    .bind(org.orgId)
    .all();

  return jsonResponse({
    devices: results.results.map((d) => ({
      deviceId: d.id,
      label: d.label,
      identifierFileName: d.expectedIdentifierFileName,
      status: d.status,
    })),
  });
}) as RequestHandler;

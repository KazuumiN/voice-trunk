import { withAuth } from "$lib/server/api/middleware.js";
import { jsonResponse } from "$lib/utils/response.js";
import { HttpError } from "$lib/utils/response.js";
import { generateId } from "$lib/utils/id.js";
import { ID_PREFIX } from "$lib/constants.js";
import type { RequestHandler } from "./$types.js";

/** Generate a cryptographically random hex string */
function generateSecret(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const GET: RequestHandler = withAuth(async ({ platform, org }) => {
  const env = platform.env;
  const results = await env.DB.prepare(
    "SELECT id, label, clientId, createdBy, createdAt, revokedAt FROM service_tokens WHERE orgId = ? ORDER BY createdAt DESC",
  )
    .bind(org.orgId)
    .all();

  return jsonResponse({
    tokens: results.results.map((t) => ({
      id: t.id,
      label: t.label,
      clientId: t.clientId,
      createdBy: t.createdBy,
      createdAt: t.createdAt,
      revokedAt: t.revokedAt,
    })),
  });
}) as RequestHandler;

export const POST: RequestHandler = withAuth(async ({ request, platform, org }) => {
  const body = await request.json() as { label?: string };
  const label = body.label?.trim();
  if (!label) {
    throw new HttpError(400, "VALIDATION_ERROR", "label is required");
  }

  const env = platform.env;
  const id = generateId(ID_PREFIX.serviceToken);
  const clientId = generateSecret(16);
  const clientSecret = generateSecret(32);
  const createdBy = org.userId || "service_token";

  await env.DB.prepare(
    "INSERT INTO service_tokens (id, orgId, label, clientId, clientSecret, createdBy) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, org.orgId, label, clientId, clientSecret, createdBy)
    .run();

  return jsonResponse(
    { id, label, clientId, clientSecret },
    201,
  );
}) as RequestHandler;

import {
  withAuth,
  validateBody,
  requireString,
} from "$lib/server/api/middleware.js";
import { HttpError, jsonResponse } from "$lib/utils/response.js";
import { generateId } from "$lib/utils/id.js";
import { ID_PREFIX } from "$lib/constants.js";
import type { RequestHandler } from "./$types.js";

export const POST: RequestHandler = withAuth(
  async ({ request, platform, org, params }) => {
    const env = platform.env;
    const draftId = params.id;

    // Fetch draft
    const draft = await env.DB.prepare(
      "SELECT * FROM workshop_drafts WHERE id = ? AND orgId = ?",
    )
      .bind(draftId, org.orgId)
      .first<{ id: string; status: string; importBatchId: string }>();

    if (!draft) {
      throw new HttpError(404, "NOT_FOUND", "Workshop draft not found");
    }

    if (draft.status !== "DRAFT") {
      throw new HttpError(
        400,
        "INVALID_STATUS_TRANSITION",
        `Cannot confirm draft in status ${draft.status}`,
      );
    }

    const body = await validateBody(request, (b) => {
      const obj = b as Record<string, unknown>;
      return {
        title: requireString(obj, "title"),
        date: requireString(obj, "date"),
        location: (obj.location as string) || "",
      };
    });

    // Create workshop
    const workshopId = generateId(ID_PREFIX.workshop);
    await env.DB.prepare(
      `INSERT INTO workshops (id, orgId, title, date, location, createdBy, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
      .bind(
        workshopId,
        org.orgId,
        body.title,
        body.date,
        body.location,
        org.userId || "service_token",
      )
      .run();

    // Update draft status
    await env.DB.prepare(
      `UPDATE workshop_drafts SET status = 'CONFIRMED', confirmedWorkshopId = ?, updatedAt = datetime('now')
       WHERE id = ? AND orgId = ?`,
    )
      .bind(workshopId, draftId, org.orgId)
      .run();

    // Link recordings to workshop
    await env.DB.prepare(
      `UPDATE recordings SET workshopId = ?, updatedAt = datetime('now')
       WHERE draftId = ? AND orgId = ?`,
    )
      .bind(workshopId, draftId, org.orgId)
      .run();

    return jsonResponse({ workshopId, draftId, status: "CONFIRMED" }, 201);
  },
) as RequestHandler;

import { withAuth } from "$lib/server/api/middleware.js";
import { HttpError, jsonResponse } from "$lib/utils/response.js";
import type { RequestHandler } from "./$types.js";

export const POST: RequestHandler = withAuth(
  async ({ platform, org, params }) => {
    const env = platform.env;
    const recordingId = params.id;

    const recording = await env.DB.prepare(
      "SELECT id, status FROM recordings WHERE id = ? AND orgId = ?",
    )
      .bind(recordingId, org.orgId)
      .first<{ id: string; status: string }>();

    if (!recording) {
      throw new HttpError(404, "NOT_FOUND", "Recording not found");
    }

    // This is an optional notification. R2 Event Notification is the primary trigger.
    // Only update if still in UPLOADING state.
    if (recording.status === "UPLOADING") {
      await env.DB.prepare(
        "UPDATE recordings SET status = 'UPLOADED', updatedAt = datetime('now') WHERE id = ? AND orgId = ?",
      )
        .bind(recordingId, org.orgId)
        .run();
    }

    return jsonResponse({ ok: true });
  },
) as RequestHandler;

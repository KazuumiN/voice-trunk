import { withAuth } from "$lib/server/api/middleware.js";
import { HttpError, jsonResponse } from "$lib/utils/response.js";
import type { RequestHandler } from "./$types.js";

export const POST: RequestHandler = withAuth(
  async ({ platform, org, params }) => {
    const env = platform.env;
    const workshopId = params.id;

    const workshop = await env.DB.prepare(
      "SELECT id, title FROM workshops WHERE id = ? AND orgId = ?",
    )
      .bind(workshopId, org.orgId)
      .first();

    if (!workshop) {
      throw new HttpError(404, "NOT_FOUND", "Workshop not found");
    }

    // Collect all recordings for this workshop
    const recordings = await env.DB.prepare(
      "SELECT id, originalFileName FROM recordings WHERE workshopId = ? AND orgId = ? AND status = 'DONE'",
    )
      .bind(workshopId, org.orgId)
      .all();

    // Collect all artifacts for these recordings
    const artifactList: Array<{ recordingId: string; type: string; r2Key: string }> = [];
    for (const rec of recordings.results) {
      const latestRun = await env.DB.prepare(
        "SELECT id FROM processing_runs WHERE recordingId = ? AND orgId = ? AND status = 'DONE' ORDER BY startedAt DESC LIMIT 1",
      )
        .bind(rec.id, org.orgId)
        .first<{ id: string }>();

      if (latestRun) {
        const arts = await env.DB.prepare(
          "SELECT type, r2Key FROM artifacts WHERE runId = ? AND orgId = ?",
        )
          .bind(latestRun.id, org.orgId)
          .all();
        for (const a of arts.results) {
          artifactList.push({
            recordingId: rec.id as string,
            type: a.type as string,
            r2Key: a.r2Key as string,
          });
        }
      }
    }

    return jsonResponse({
      workshopId,
      title: workshop.title,
      recordingCount: recordings.results.length,
      artifacts: artifactList,
    });
  },
) as RequestHandler;

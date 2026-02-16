import { withAuth } from "$lib/server/api/middleware.js";
import { HttpError } from "$lib/utils/response.js";
import { jsonResponse } from "$lib/utils/response.js";
import type { RequestHandler } from "./$types.js";

export const GET: RequestHandler = withAuth(async ({ platform, org, params }) => {
  const env = platform.env;
  const recordingId = params.id;

  const recording = await env.DB.prepare(
    "SELECT * FROM recordings WHERE id = ? AND orgId = ?",
  )
    .bind(recordingId, org.orgId)
    .first();

  if (!recording) {
    throw new HttpError(404, "NOT_FOUND", "Recording not found");
  }

  // Fetch latest processing run
  const latestRun = await env.DB.prepare(
    "SELECT * FROM processing_runs WHERE recordingId = ? AND orgId = ? ORDER BY startedAt DESC LIMIT 1",
  )
    .bind(recordingId, org.orgId)
    .first();

  // Fetch artifacts for latest run
  let artifacts: unknown[] = [];
  if (latestRun) {
    const artifactResults = await env.DB.prepare(
      "SELECT * FROM artifacts WHERE runId = ? AND orgId = ?",
    )
      .bind(latestRun.id, org.orgId)
      .all();
    artifacts = artifactResults.results;
  }

  // Fetch chunks
  const chunks = await env.DB.prepare(
    "SELECT * FROM recording_chunks WHERE recordingId = ? ORDER BY chunkIndex ASC",
  )
    .bind(recordingId)
    .all();

  return jsonResponse({
    ...recording,
    latestRun: latestRun
      ? {
          ...latestRun,
          completedSteps: latestRun.completedSteps
            ? JSON.parse(latestRun.completedSteps as string)
            : [],
        }
      : null,
    artifacts,
    chunks: chunks.results,
  });
}) as RequestHandler;

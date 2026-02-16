import {
  withAuth,
  validateBody,
  requireString,
  requireNumber,
} from "$lib/server/api/middleware.js";
import { HttpError, jsonResponse } from "$lib/utils/response.js";
import { PRESIGN_TTL } from "$lib/constants.js";
import { createR2Client, presignPartUrl } from "$lib/server/r2/presign.js";
import type { RequestHandler } from "./$types.js";

export const POST: RequestHandler = withAuth(
  async ({ request, platform, org, params }) => {
    const env = platform.env;
    const recordingId = params.id;

    const recording = await env.DB.prepare(
      "SELECT id, rawR2Key FROM recordings WHERE id = ? AND orgId = ? AND status = 'UPLOADING'",
    )
      .bind(recordingId, org.orgId)
      .first<{ id: string; rawR2Key: string }>();

    if (!recording) {
      throw new HttpError(
        404,
        "NOT_FOUND",
        "Recording not found or not in UPLOADING state",
      );
    }

    const body = await validateBody(request, (b) => {
      const obj = b as Record<string, unknown>;
      return {
        uploadId: requireString(obj, "uploadId"),
        partNumber: requireNumber(obj, "partNumber"),
      };
    });

    const client = createR2Client(env);
    const url = await presignPartUrl(
      client,
      "r2-raw-audio",
      recording.rawR2Key,
      body.uploadId,
      body.partNumber,
      PRESIGN_TTL.UPLOAD_DEFAULT_SECONDS,
    );

    return jsonResponse({ url, partNumber: body.partNumber });
  },
) as RequestHandler;

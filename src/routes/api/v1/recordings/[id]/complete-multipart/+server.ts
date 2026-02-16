import {
  withAuth,
  validateBody,
  requireString,
} from "$lib/server/api/middleware.js";
import { HttpError, jsonResponse } from "$lib/utils/response.js";
import {
  createR2Client,
  completeMultipartUpload,
} from "$lib/server/r2/presign.js";
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
      const parts = obj.parts as Array<{
        partNumber: number;
        eTag: string;
      }>;
      if (!Array.isArray(parts) || parts.length === 0) {
        throw new HttpError(400, "VALIDATION_ERROR", "parts array required");
      }
      return {
        uploadId: requireString(obj, "uploadId"),
        parts: parts.map((p) => ({
          partNumber: p.partNumber,
          eTag: p.eTag,
        })),
      };
    });

    const client = createR2Client(env);
    await completeMultipartUpload(
      client,
      "r2-raw-audio",
      recording.rawR2Key,
      body.uploadId,
      body.parts,
    );

    return jsonResponse({ ok: true });
  },
) as RequestHandler;

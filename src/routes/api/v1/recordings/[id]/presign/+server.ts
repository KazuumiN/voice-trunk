import { withAuth, validateBody } from "$lib/server/api/middleware.js";
import { HttpError, jsonResponse } from "$lib/utils/response.js";
import { PRESIGN_TTL } from "$lib/constants.js";
import {
  createR2Client,
  presignPutUrl,
  createMultipartUpload,
} from "$lib/server/r2/presign.js";
import type { RequestHandler } from "./$types.js";

export const POST: RequestHandler = withAuth(
  async ({ request, platform, org, params }) => {
    const env = platform.env;
    const recordingId = params.id;

    // Verify recording belongs to org
    const recording = await env.DB.prepare(
      "SELECT id, rawR2Key, status, mimeType FROM recordings WHERE id = ? AND orgId = ?",
    )
      .bind(recordingId, org.orgId)
      .first<{
        id: string;
        rawR2Key: string;
        status: string;
        mimeType: string;
      }>();

    if (!recording) {
      throw new HttpError(404, "NOT_FOUND", "Recording not found");
    }

    if (recording.status !== "REGISTERED" && recording.status !== "UPLOADING") {
      throw new HttpError(
        400,
        "INVALID_STATUS_TRANSITION",
        `Cannot presign for recording in status ${recording.status}`,
      );
    }

    const body = await validateBody(request, (b) => {
      const obj = b as Record<string, unknown>;
      return {
        multipart: obj.multipart === true,
        expiresInSeconds:
          typeof obj.expiresInSeconds === "number"
            ? Math.min(
                obj.expiresInSeconds,
                PRESIGN_TTL.UPLOAD_MAX_SECONDS,
              )
            : PRESIGN_TTL.UPLOAD_DEFAULT_SECONDS,
      };
    });

    const client = createR2Client(env);

    if (body.multipart) {
      const { uploadId } = await createMultipartUpload(
        client,
        "r2-raw-audio",
        recording.rawR2Key,
        recording.mimeType,
      );

      // Update status to UPLOADING
      await env.DB.prepare(
        "UPDATE recordings SET status = 'UPLOADING', updatedAt = datetime('now') WHERE id = ? AND orgId = ?",
      )
        .bind(recordingId, org.orgId)
        .run();

      return jsonResponse({
        method: "MULTIPART",
        uploadId,
        key: recording.rawR2Key,
      });
    }

    const { url, headers } = await presignPutUrl(
      client,
      "r2-raw-audio",
      recording.rawR2Key,
      body.expiresInSeconds,
      recording.mimeType,
    );

    // Update status to UPLOADING
    await env.DB.prepare(
      "UPDATE recordings SET status = 'UPLOADING', updatedAt = datetime('now') WHERE id = ? AND orgId = ?",
    )
      .bind(recordingId, org.orgId)
      .run();

    return jsonResponse({ method: "PUT", url, headers });
  },
) as RequestHandler;

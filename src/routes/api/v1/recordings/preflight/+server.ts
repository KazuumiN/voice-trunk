import {
  withAuth,
  validateBody,
  requireString,
  requireNumber,
} from "$lib/server/api/middleware.js";
import { HttpError, jsonResponse } from "$lib/utils/response.js";
import { generateId } from "$lib/utils/id.js";
import { ID_PREFIX, R2_KEYS } from "$lib/constants.js";
import type { RequestHandler } from "./$types.js";

export const POST: RequestHandler = withAuth(async ({ request, platform, org }) => {
  const env = platform.env;
  const body = await validateBody(request, (b) => {
    const obj = b as Record<string, unknown>;
    return {
      deviceId: (typeof obj.deviceId === "string" && obj.deviceId.length > 0) ? obj.deviceId : null,
      originalFileName: requireString(obj, "originalFileName"),
      recorderFileCreatedAt: (obj.recorderFileCreatedAt as string) || null,
      sizeBytes: requireNumber(obj, "sizeBytes"),
      sha256: requireString(obj, "sha256"),
    };
  });

  // Check device exists (only when deviceId is provided)
  if (body.deviceId) {
    const device = await env.DB.prepare(
      "SELECT id FROM devices WHERE id = ? AND orgId = ?",
    )
      .bind(body.deviceId, org.orgId)
      .first();
    if (!device) {
      throw new HttpError(404, "DEVICE_NOT_FOUND", "Device not registered");
    }
  }

  // Check for existing recording with same sha256
  const existing = await env.DB.prepare(
    "SELECT id, status FROM recordings WHERE orgId = ? AND sha256 = ?",
  )
    .bind(org.orgId, body.sha256)
    .first<{ id: string; status: string }>();

  if (existing) {
    // If previous upload never completed (stuck in REGISTERED or ERROR), clean up and allow re-upload
    if (existing.status === "REGISTERED" || existing.status === "ERROR") {
      await env.DB.prepare(
        "DELETE FROM recordings WHERE id = ? AND orgId = ?",
      )
        .bind(existing.id, org.orgId)
        .run();
    } else {
      return jsonResponse({
        status: "ALREADY_EXISTS",
        recordingId: existing.id,
      });
    }
  }

  // Create new recording with auto-created import batch
  const recordingId = generateId(ID_PREFIX.recording);
  const uploadId = generateId(ID_PREFIX.upload);
  const batchId = generateId(ID_PREFIX.importBatch);
  const rawR2Key = R2_KEYS.raw(org.orgId, recordingId, body.originalFileName);
  const mimeType = guessMimeType(body.originalFileName);
  const needsConversion = mimeType === "audio/x-ms-wma" ? 1 : 0;

  await env.DB.prepare(
    `INSERT INTO import_batches (id, orgId, createdBy, startedAt, status, totalFiles, uploadedFiles, errorFiles)
     VALUES (?, ?, ?, datetime('now'), 'OPEN', 1, 0, 0)`,
  )
    .bind(batchId, org.orgId, org.userId || "service_token")
    .run();

  await env.DB.prepare(
    `INSERT INTO recordings (id, orgId, deviceId, importBatchId, originalFileName, recorderFileCreatedAt, sizeBytes, sha256, mimeType, needsConversion, rawR2Key, status, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'REGISTERED', datetime('now'), datetime('now'))`,
  )
    .bind(
      recordingId,
      org.orgId,
      body.deviceId,
      batchId,
      body.originalFileName,
      body.recorderFileCreatedAt,
      body.sizeBytes,
      body.sha256,
      mimeType,
      needsConversion,
      rawR2Key,
    )
    .run();

  return jsonResponse(
    {
      status: "NEW",
      recordingId,
      uploadId,
      rawR2Key,
    },
    201,
  );
}) as RequestHandler;

function guessMimeType(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop();
  switch (ext) {
    case "wav":
      return "audio/wav";
    case "mp3":
      return "audio/mpeg";
    case "wma":
      return "audio/x-ms-wma";
    case "m4a":
      return "audio/mp4";
    case "flac":
      return "audio/flac";
    case "ogg":
      return "audio/ogg";
    default:
      return "application/octet-stream";
  }
}

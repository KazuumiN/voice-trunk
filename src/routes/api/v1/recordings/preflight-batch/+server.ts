import {
  withAuth,
  validateBody,
  requireString,
} from "$lib/server/api/middleware.js";
import { HttpError, jsonResponse } from "$lib/utils/response.js";
import { generateId } from "$lib/utils/id.js";
import { ID_PREFIX, R2_KEYS, BATCH_PREFLIGHT_MAX } from "$lib/constants.js";
import type { PreflightResult } from "$lib/types/index.js";
import type { RequestHandler } from "./$types.js";

export const POST: RequestHandler = withAuth(async ({ request, platform, org }) => {
  const env = platform.env;
  const body = await validateBody(request, (b) => {
    const obj = b as Record<string, unknown>;
    const files = obj.files as Array<Record<string, unknown>>;
    if (!Array.isArray(files) || files.length === 0) {
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        "files array is required and must not be empty",
      );
    }
    if (files.length > BATCH_PREFLIGHT_MAX) {
      throw new HttpError(
        400,
        "BATCH_LIMIT_EXCEEDED",
        `Maximum ${BATCH_PREFLIGHT_MAX} files per batch`,
      );
    }
    return {
      batchId: (obj.batchId as string) || generateId(ID_PREFIX.importBatch),
      files: files.map((f) => ({
        deviceId: (typeof f.deviceId === "string" && f.deviceId.length > 0) ? f.deviceId : null,
        originalFileName: requireString(f, "originalFileName"),
        recorderFileCreatedAt: (f.recorderFileCreatedAt as string) || null,
        sizeBytes: f.sizeBytes as number,
        sha256: requireString(f, "sha256"),
      })),
    };
  });

  // Ensure import batch exists
  const existingBatch = await env.DB.prepare(
    "SELECT id FROM import_batches WHERE id = ? AND orgId = ?",
  )
    .bind(body.batchId, org.orgId)
    .first();

  if (!existingBatch) {
    await env.DB.prepare(
      `INSERT INTO import_batches (id, orgId, createdBy, startedAt, status, totalFiles, uploadedFiles, errorFiles)
       VALUES (?, ?, ?, datetime('now'), 'OPEN', ?, 0, 0)`,
    )
      .bind(
        body.batchId,
        org.orgId,
        org.userId || "service_token",
        body.files.length,
      )
      .run();
  }

  // Validate devices exist (for files that have a deviceId)
  const deviceIds = new Set(body.files.map((f) => f.deviceId).filter((id): id is string => id !== null));
  for (const deviceId of deviceIds) {
    const device = await env.DB.prepare(
      "SELECT id FROM devices WHERE id = ? AND orgId = ?",
    )
      .bind(deviceId, org.orgId)
      .first();
    if (!device) {
      throw new HttpError(404, "DEVICE_NOT_FOUND", `Device ${deviceId} not registered`);
    }
  }

  // Batch check all sha256s
  const sha256List = body.files.map((f) => f.sha256);
  // D1 doesn't support IN with bindings well for large lists, use individual queries
  const existingMap = new Map<string, string>();
  for (const sha256 of sha256List) {
    const existing = await env.DB.prepare(
      "SELECT id, status FROM recordings WHERE orgId = ? AND sha256 = ?",
    )
      .bind(org.orgId, sha256)
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
        existingMap.set(sha256, existing.id);
      }
    }
  }

  const results: PreflightResult[] = [];
  for (const file of body.files) {
    const existingId = existingMap.get(file.sha256);
    if (existingId) {
      results.push({
        sha256: file.sha256,
        status: "ALREADY_EXISTS",
        recordingId: existingId,
      });
    } else {
      const recordingId = generateId(ID_PREFIX.recording);
      const uploadId = generateId(ID_PREFIX.upload);
      const rawR2Key = R2_KEYS.raw(
        org.orgId,
        recordingId,
        file.originalFileName,
      );

      const ext = file.originalFileName.toLowerCase().split(".").pop();
      const mimeType =
        ext === "wma"
          ? "audio/x-ms-wma"
          : ext === "wav"
            ? "audio/wav"
            : ext === "mp3"
              ? "audio/mpeg"
              : ext === "m4a"
                ? "audio/mp4"
                : ext === "flac"
                  ? "audio/flac"
                  : ext === "ogg"
                    ? "audio/ogg"
                    : "application/octet-stream";
      const needsConversion = mimeType === "audio/x-ms-wma" ? 1 : 0;

      await env.DB.prepare(
        `INSERT INTO recordings (id, orgId, deviceId, importBatchId, originalFileName, recorderFileCreatedAt, sizeBytes, sha256, mimeType, needsConversion, rawR2Key, status, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'REGISTERED', datetime('now'), datetime('now'))`,
      )
        .bind(
          recordingId,
          org.orgId,
          file.deviceId,
          body.batchId,
          file.originalFileName,
          file.recorderFileCreatedAt,
          file.sizeBytes,
          file.sha256,
          mimeType,
          needsConversion,
          rawR2Key,
        )
        .run();

      results.push({
        sha256: file.sha256,
        status: "NEW",
        recordingId,
        uploadId,
        rawR2Key,
      });
    }
  }

  return jsonResponse({ batchId: body.batchId, results });
}) as RequestHandler;

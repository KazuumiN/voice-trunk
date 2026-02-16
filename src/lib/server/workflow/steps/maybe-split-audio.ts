import type { Env } from "../../../types/env.js";
import type { Recording, RecordingChunk } from "../../../types/index.js";
import { MODEL_LIMITS } from "../../../constants.js";
import { orgScopedQuery } from "../../db/index.js";

export interface SplitResult {
  needsSplit: boolean;
  chunks: ChunkInfo[];
}

export interface ChunkInfo {
  chunkIndex: number;
  r2Key: string;
  startMs: number;
  endMs: number;
  mimeType: string;
}

/**
 * Step 3: Check if audio exceeds model limits and needs splitting.
 * Phase 1: Assume chunks were already uploaded by the local importer, or treat raw file as single chunk.
 */
export async function maybeSplitAudio(
  env: Env,
  recording: Recording,
  presignedUrl: string,
): Promise<SplitResult> {
  const modelConfig = MODEL_LIMITS[env.DEFAULT_GEMINI_MODEL];
  if (!modelConfig) {
    throw new Error(`Unknown model: ${env.DEFAULT_GEMINI_MODEL}`);
  }

  // Check if file exceeds model limits
  const needsSplit = recording.sizeBytes > modelConfig.maxBytes;

  if (!needsSplit) {
    // Check if there are existing chunks in D1 (uploaded by importer)
    const db = orgScopedQuery(env.DB, recording.orgId);
    const existingChunks = await db.queryAll<RecordingChunk>(
      `SELECT * FROM recording_chunks WHERE recordingId = ? ORDER BY chunkIndex ASC`,
      recording.id,
    );

    if (existingChunks.length > 0) {
      // Chunks already exist (uploaded by importer)
      return {
        needsSplit: true,
        chunks: existingChunks.map((c) => ({
          chunkIndex: c.chunkIndex,
          r2Key: c.r2Key,
          startMs: c.startMs,
          endMs: c.endMs,
          mimeType: recording.mimeType,
        })),
      };
    }

    // No chunks and file is within limits: treat raw file as single chunk
    return {
      needsSplit: false,
      chunks: [
        {
          chunkIndex: 0,
          r2Key: recording.rawR2Key,
          startMs: 0,
          endMs: recording.durationMs ?? 0,
          mimeType: recording.mimeType,
        },
      ],
    };
  }

  // File exceeds limits - check for pre-existing chunks from importer
  const db = orgScopedQuery(env.DB, recording.orgId);
  const existingChunks = await db.queryAll<RecordingChunk>(
    `SELECT * FROM recording_chunks WHERE recordingId = ? ORDER BY chunkIndex ASC`,
    recording.id,
  );

  if (existingChunks.length > 0) {
    return {
      needsSplit: true,
      chunks: existingChunks.map((c) => ({
        chunkIndex: c.chunkIndex,
        r2Key: c.r2Key,
        startMs: c.startMs,
        endMs: c.endMs,
        mimeType: recording.mimeType,
      })),
    };
  }

  // Phase 1: No server-side splitting available.
  // The importer should have split large files before upload.
  throw new Error(
    `Recording ${recording.id} (${(recording.sizeBytes / 1024 / 1024).toFixed(1)} MB) ` +
      `exceeds model limit (${(modelConfig.maxBytes / 1024 / 1024).toFixed(0)} MB) ` +
      `but no pre-split chunks were found. ` +
      `The importer must split files exceeding ${(modelConfig.maxBytes / 1024 / 1024).toFixed(0)} MB before uploading.`,
  );
}

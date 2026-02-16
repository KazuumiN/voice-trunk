import type { Env } from "../../../types/env.js";
import type { TranscriptSegment } from "../../../types/index.js";
import { orgScopedQuery } from "../../db/index.js";
import * as semaphore from "../../db/gemini-semaphore.js";
import { createR2Client, presignGetUrl } from "../../r2/presign.js";
import { artifactKey } from "../../r2/keys.js";
import { GeminiClient } from "../../gemini/client.js";
import { PRESIGN_TTL, R2_BUCKET } from "../../../constants.js";
import type { ChunkInfo } from "./maybe-split-audio.js";

export interface ChunkTranscript {
  chunkIndex: number;
  startMs: number;
  endMs: number;
  segments: TranscriptSegment[];
  language: string;
}

/**
 * Step 4: Transcribe each chunk using Gemini API.
 * Acquires semaphore before each Gemini call for rate limiting.
 */
export async function transcribeChunks(
  env: Env,
  recordingId: string,
  orgId: string,
  runId: string,
  chunks: ChunkInfo[],
): Promise<ChunkTranscript[]> {
  const db = orgScopedQuery(env.DB, orgId);
  const geminiClient = new GeminiClient(env.GEMINI_API_KEY, env.DEFAULT_GEMINI_MODEL);
  const maxConcurrent = parseInt(env.GEMINI_MAX_CONCURRENT, 10) || 5;
  const r2Client = createR2Client(env);
  const bucketName = R2_BUCKET.RAW_AUDIO;

  const results: ChunkTranscript[] = [];

  for (const chunk of chunks) {
    // Acquire semaphore with retry loop
    let sem = await semaphore.acquire(db, `${recordingId}-chunk-${chunk.chunkIndex}`, maxConcurrent, 600);
    let waitAttempts = 0;
    while (!sem && waitAttempts < 30) {
      // Wait 10 seconds and retry
      await sleep(10_000);
      sem = await semaphore.acquire(db, `${recordingId}-chunk-${chunk.chunkIndex}`, maxConcurrent, 600);
      waitAttempts++;
    }
    if (!sem) {
      throw new Error("Failed to acquire Gemini semaphore after 5 minutes");
    }

    try {
      // Generate a fresh presigned URL for this chunk
      const presignedUrl = await presignGetUrl(
        r2Client,
        bucketName,
        chunk.r2Key,
        PRESIGN_TTL.GEMINI_MIN_SECONDS,
      );

      const { segments, language } = await geminiClient.transcribe(
        presignedUrl,
        chunk.mimeType,
      );

      // Offset segment timestamps by chunk's global startMs
      const offsetSegments = segments.map((seg) => ({
        ...seg,
        startMs: seg.startMs + chunk.startMs,
        endMs: seg.endMs + chunk.startMs,
      }));

      // Save chunk transcript to R2
      const chunkTranscriptKey = artifactKey(
        orgId,
        recordingId,
        runId,
        `transcript-chunk-${chunk.chunkIndex}.json`,
      );
      await env.R2_ARTIFACTS.put(
        chunkTranscriptKey,
        JSON.stringify({
          chunkIndex: chunk.chunkIndex,
          segments: offsetSegments,
          language,
        }),
      );

      results.push({
        chunkIndex: chunk.chunkIndex,
        startMs: chunk.startMs,
        endMs: chunk.endMs,
        segments: offsetSegments,
        language,
      });
    } finally {
      // Always release semaphore
      await semaphore.release(db, sem.id);
    }
  }

  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

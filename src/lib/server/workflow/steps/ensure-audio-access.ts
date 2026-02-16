import type { Env } from "../../../types/env.js";
import type { Recording } from "../../../types/index.js";
import { createR2Client, presignGetUrl } from "../../r2/presign.js";
import { PRESIGN_TTL, R2_BUCKET } from "../../../constants.js";

export interface AudioAccessResult {
  presignedUrl: string;
  mimeType: string;
  rawR2Key: string;
}

/**
 * Step 2: Verify raw audio exists in R2 and generate a presigned GET URL for Gemini.
 */
export async function ensureAudioAccess(
  env: Env,
  recording: Recording,
): Promise<AudioAccessResult> {
  // Verify the raw file exists in R2
  const obj = await env.R2_RAW_AUDIO.head(recording.rawR2Key);
  if (!obj) {
    throw new Error(
      `Raw audio not found in R2: ${recording.rawR2Key}`,
    );
  }

  // Estimate processing time for TTL calculation
  // fileSizeBytes / (16000 * 2) * processingFactor (0.5 for Gemini)
  const estimatedSeconds = (recording.sizeBytes / 32000) * 0.5;
  const ttlSeconds = Math.max(
    PRESIGN_TTL.GEMINI_MIN_SECONDS,
    Math.ceil(estimatedSeconds * 3),
  );

  // Generate presigned GET URL
  const r2Client = createR2Client(env);
  const bucketName = R2_BUCKET.RAW_AUDIO;
  const presignedUrl = await presignGetUrl(
    r2Client,
    bucketName,
    recording.rawR2Key,
    ttlSeconds,
  );

  return {
    presignedUrl,
    mimeType: recording.mimeType,
    rawR2Key: recording.rawR2Key,
  };
}

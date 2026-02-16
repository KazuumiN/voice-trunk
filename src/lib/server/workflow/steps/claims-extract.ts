import type { Env } from "../../../types/env.js";
import type { TranscriptJson, ClaimsJson } from "../../../types/index.js";
import { orgScopedQuery } from "../../db/index.js";
import * as semaphore from "../../db/gemini-semaphore.js";
import { GeminiClient } from "../../gemini/client.js";
import { artifactKey } from "../../r2/keys.js";
import { generateId } from "../../../utils/id.js";
import { ID_PREFIX } from "../../../constants.js";

/**
 * Step 7: Extract claims from the transcript using Gemini.
 * Each claim includes stance (AFFIRM/NEGATE/UNCERTAIN/REPORTING),
 * speaker, timestamps, quote, and evidence segment IDs.
 */
export async function claimsExtract(
  env: Env,
  recordingId: string,
  orgId: string,
  runId: string,
  transcript: TranscriptJson,
): Promise<ClaimsJson> {
  const db = orgScopedQuery(env.DB, orgId);
  const geminiClient = new GeminiClient(env.GEMINI_API_KEY, env.DEFAULT_GEMINI_MODEL);
  const maxConcurrent = parseInt(env.GEMINI_MAX_CONCURRENT, 10) || 5;

  // Build transcript text with segment IDs for evidence linking
  const transcriptText = transcript.segments
    .map((s) => `[${s.segmentId}] [${s.speaker}] (${s.startMs}-${s.endMs}ms) ${s.text}`)
    .join("\n");

  // Acquire semaphore
  let sem = await semaphore.acquire(db, `${recordingId}-claims`, maxConcurrent, 600);
  let waitAttempts = 0;
  while (!sem && waitAttempts < 30) {
    await sleep(10_000);
    sem = await semaphore.acquire(db, `${recordingId}-claims`, maxConcurrent, 600);
    waitAttempts++;
  }
  if (!sem) {
    throw new Error("Failed to acquire Gemini semaphore for claims extraction");
  }

  try {
    const claimsJson = await geminiClient.extractClaims(transcriptText);

    // Save claims to R2
    const r2Key = artifactKey(orgId, recordingId, runId, "claims.json");
    await env.R2_ARTIFACTS.put(r2Key, JSON.stringify(claimsJson));

    // Create artifact record
    const artifactId = generateId(ID_PREFIX.artifact);
    await db.run(
      `INSERT INTO artifacts (id, runId, orgId, type, r2Key, createdAt)
       VALUES (?, ?, ?, 'claims', ?, datetime('now'))`,
      artifactId,
      runId,
      orgId,
      r2Key,
    );

    return claimsJson;
  } finally {
    await semaphore.release(db, sem.id);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

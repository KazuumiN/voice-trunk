import type { Env } from "../../../types/env.js";
import type { TranscriptJson, SummaryJson } from "../../../types/index.js";
import { orgScopedQuery } from "../../db/index.js";
import * as semaphore from "../../db/gemini-semaphore.js";
import { GeminiClient } from "../../gemini/client.js";
import { artifactKey } from "../../r2/keys.js";
import { generateId } from "../../../utils/id.js";
import { ID_PREFIX } from "../../../constants.js";

/**
 * Step 6: Summarize the transcript using Gemini.
 * Generates shortSummary, longSummary, keyPoints, decisions, openItems.
 */
export async function summarize(
  env: Env,
  recordingId: string,
  orgId: string,
  runId: string,
  transcript: TranscriptJson,
): Promise<SummaryJson> {
  const db = orgScopedQuery(env.DB, orgId);
  const geminiClient = new GeminiClient(env.GEMINI_API_KEY, env.DEFAULT_GEMINI_MODEL);
  const maxConcurrent = parseInt(env.GEMINI_MAX_CONCURRENT, 10) || 5;

  // Build transcript text from segments
  const transcriptText = transcript.segments
    .map((s) => `[${s.speaker}] ${s.text}`)
    .join("\n");

  // Acquire semaphore
  let sem = await semaphore.acquire(db, `${recordingId}-summarize`, maxConcurrent, 600);
  let waitAttempts = 0;
  while (!sem && waitAttempts < 30) {
    await sleep(10_000);
    sem = await semaphore.acquire(db, `${recordingId}-summarize`, maxConcurrent, 600);
    waitAttempts++;
  }
  if (!sem) {
    throw new Error("Failed to acquire Gemini semaphore for summarization");
  }

  try {
    const result = await geminiClient.summarize(transcriptText);

    const summaryJson: SummaryJson = {
      recordingId,
      runId,
      shortSummary: result.shortSummary,
      longSummary: result.longSummary,
      keyPoints: result.keyPoints,
      decisions: result.decisions,
      openItems: result.openItems,
    };

    // Save summary to R2
    const r2Key = artifactKey(orgId, recordingId, runId, "summary.json");
    await env.R2_ARTIFACTS.put(r2Key, JSON.stringify(summaryJson));

    // Create artifact record
    const artifactId = generateId(ID_PREFIX.artifact);
    await db.run(
      `INSERT INTO artifacts (id, runId, orgId, type, r2Key, createdAt)
       VALUES (?, ?, ?, 'summary', ?, datetime('now'))`,
      artifactId,
      runId,
      orgId,
      r2Key,
    );

    return summaryJson;
  } finally {
    await semaphore.release(db, sem.id);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

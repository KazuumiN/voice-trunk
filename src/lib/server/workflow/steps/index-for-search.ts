import type { Env } from "../../../types/env.js";
import type { TranscriptJson } from "../../../types/index.js";

/**
 * Step 9: Insert transcript segments into D1 FTS5 table for full-text search.
 * Non-critical step - wrapped in try/catch by the caller.
 */
export async function indexForSearch(
  env: Env,
  orgId: string,
  recordingId: string,
  transcript: TranscriptJson,
): Promise<{ indexed: number }> {
  // Ensure the FTS5 virtual table exists
  await env.DB.prepare(
    `CREATE VIRTUAL TABLE IF NOT EXISTS transcript_segments_fts USING fts5(
      orgId,
      recordingId,
      segmentId,
      speaker,
      text,
      content='',
      contentless_delete=1,
      tokenize='unicode61'
    )`,
  ).run();

  let indexed = 0;

  // Insert segments in batches to avoid hitting D1 limits
  const batchSize = 50;
  for (let i = 0; i < transcript.segments.length; i += batchSize) {
    const batch = transcript.segments.slice(i, i + batchSize);
    const statements = batch.map((segment) =>
      env.DB.prepare(
        `INSERT INTO transcript_segments_fts (orgId, recordingId, segmentId, speaker, text)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(orgId, recordingId, segment.segmentId, segment.speaker, segment.text),
    );

    await env.DB.batch(statements);
    indexed += batch.length;
  }

  return { indexed };
}

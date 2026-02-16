import type { Env } from "../../../types/env.js";
import type { Recording, WorkflowInput } from "../../../types/index.js";
import { orgScopedQuery } from "../../db/index.js";

export interface LoadMetadataResult {
  recording: Recording;
  runId: string;
}

/**
 * Step 1: Load recording metadata from D1, set status to PROCESSING.
 * Creates processing_run if not already exists (queue-consumer creates it).
 */
export async function loadMetadata(
  env: Env,
  input: WorkflowInput,
): Promise<LoadMetadataResult> {
  const db = orgScopedQuery(env.DB, input.orgId);

  const recording = await db.queryFirst<Recording>(
    `SELECT * FROM recordings WHERE id = ? AND orgId = ?`,
    input.recordingId,
    input.orgId,
  );

  if (!recording) {
    throw new Error(`Recording ${input.recordingId} not found`);
  }

  // Set status to PROCESSING
  await db.run(
    `UPDATE recordings SET status = 'PROCESSING', updatedAt = datetime('now') WHERE id = ? AND orgId = ?`,
    input.recordingId,
    input.orgId,
  );

  // Ensure processing_run exists (queue-consumer already creates it, but be idempotent)
  const existingRun = await db.queryFirst<{ id: string }>(
    `SELECT id FROM processing_runs WHERE id = ? AND orgId = ?`,
    input.runId,
    input.orgId,
  );

  if (!existingRun) {
    await db.run(
      `INSERT INTO processing_runs (id, recordingId, orgId, provider, model, configJson, status, completedSteps, retryCount, startedAt)
       VALUES (?, ?, ?, 'gemini', ?, '{}', 'RUNNING', '[]', 0, datetime('now'))`,
      input.runId,
      input.recordingId,
      input.orgId,
      env.DEFAULT_GEMINI_MODEL,
    );
  }

  // Re-read recording with updated status
  const updated = await db.queryFirst<Recording>(
    `SELECT * FROM recordings WHERE id = ? AND orgId = ?`,
    input.recordingId,
    input.orgId,
  );

  if (!updated) {
    throw new Error(
      `Recording ${input.recordingId} disappeared after status update`,
    );
  }

  return {
    recording: updated,
    runId: input.runId,
  };
}

import { parseRecordingIdFromKey } from "../lib/server/r2/keys.js";
import type { Env } from "../lib/types/env.js";

/** Shape of the R2 event notification message body */
export interface R2EventMessage {
  account: string;
  bucket: string;
  object: { key: string; size: number; eTag: string };
  action: string;
  eventTime: string;
}

export async function handleQueue(
  batch: MessageBatch<R2EventMessage>,
  env: Env,
): Promise<void> {
  for (const message of batch.messages) {
    try {
      await processMessage(message, env);
      message.ack();
    } catch (err) {
      console.error(
        `[queue-consumer] Failed to process message ${message.id}:`,
        err,
      );
      message.retry();
    }
  }
}

async function processMessage(
  message: Message<R2EventMessage>,
  env: Env,
): Promise<void> {
  const event = message.body;
  const objectKey = event.object.key;

  const parsed = parseRecordingIdFromKey(objectKey);
  if (!parsed) {
    console.warn(
      `[queue-consumer] Could not parse recordingId from key: ${objectKey}`,
    );
    return;
  }

  const { orgId, recordingId } = parsed;

  // Update recording status to UPLOADED
  await env.DB.prepare(
    "UPDATE recordings SET status = 'UPLOADED', updatedAt = datetime('now') WHERE id = ? AND orgId = ?",
  )
    .bind(recordingId, orgId)
    .run();

  // Generate a run ID for the workflow
  const runId = `run-${crypto.randomUUID()}`;

  // Create initial processing_runs record
  await env.DB.prepare(
    `INSERT INTO processing_runs (id, recordingId, orgId, provider, model, configJson, status, completedSteps, retryCount, startedAt)
     VALUES (?, ?, ?, 'gemini', ?, '{}', 'RUNNING', '[]', 0, datetime('now'))`,
  )
    .bind(runId, recordingId, orgId, env.DEFAULT_GEMINI_MODEL)
    .run();

  // Start the RecordingPipelineWorkflow
  await env.RECORDING_PIPELINE.create({
    id: `${recordingId}-${runId}`,
    params: { recordingId, orgId, runId },
  });
}

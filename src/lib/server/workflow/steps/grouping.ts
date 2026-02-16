import type { Env } from "../../../types/env.js";
import type { Recording } from "../../../types/index.js";
import { orgScopedQuery } from "../../db/index.js";
import { generateId } from "../../../utils/id.js";
import { ID_PREFIX } from "../../../constants.js";

interface GroupingResult {
  draftId: string | null;
  isNewDraft: boolean;
}

/**
 * Step 8: Auto-group recordings into WorkshopDrafts.
 * Groups by importBatch + device + time proximity.
 */
export async function groupRecording(
  env: Env,
  recording: Recording,
): Promise<GroupingResult> {
  const db = orgScopedQuery(env.DB, recording.orgId);

  // If recording already has a draftId or workshopId, skip grouping
  if (recording.draftId || recording.workshopId) {
    return { draftId: recording.draftId, isNewDraft: false };
  }

  // Find other recordings in the same import batch
  const batchRecordings = await db.queryAll<Recording>(
    `SELECT * FROM recordings
     WHERE orgId = ? AND importBatchId = ? AND id != ?
     ORDER BY recorderFileCreatedAt ASC`,
    recording.orgId,
    recording.importBatchId,
    recording.id,
  );

  // Look for an existing draft in this import batch
  const existingDraft = await db.queryFirst<{ id: string }>(
    `SELECT wd.id FROM workshop_drafts wd
     WHERE wd.orgId = ? AND wd.importBatchId = ? AND wd.status = 'DRAFT'
     LIMIT 1`,
    recording.orgId,
    recording.importBatchId,
  );

  if (existingDraft) {
    // Check time proximity: if this recording is within 2 hours of any recording in the draft
    const draftRecordings = await db.queryAll<Recording>(
      `SELECT * FROM recordings
       WHERE orgId = ? AND draftId = ?`,
      recording.orgId,
      existingDraft.id,
    );

    const isTimeProximate = draftRecordings.some((dr) => {
      if (!dr.recorderFileCreatedAt || !recording.recorderFileCreatedAt) return true;
      const timeDiff = Math.abs(
        new Date(dr.recorderFileCreatedAt).getTime() -
          new Date(recording.recorderFileCreatedAt).getTime(),
      );
      return timeDiff < 2 * 60 * 60 * 1000; // 2 hours
    });

    if (isTimeProximate) {
      // Link to existing draft
      await db.run(
        `UPDATE recordings SET draftId = ?, updatedAt = datetime('now')
         WHERE id = ? AND orgId = ?`,
        existingDraft.id,
        recording.id,
        recording.orgId,
      );
      return { draftId: existingDraft.id, isNewDraft: false };
    }
  }

  // Create a new draft for this batch
  const draftId = generateId(ID_PREFIX.workshopDraft);
  const confidenceScore = calculateConfidence(recording, batchRecordings);

  await db.run(
    `INSERT INTO workshop_drafts (id, orgId, importBatchId, status, confidenceScore, reason, createdAt, updatedAt)
     VALUES (?, ?, ?, 'DRAFT', ?, ?, datetime('now'), datetime('now'))`,
    draftId,
    recording.orgId,
    recording.importBatchId,
    confidenceScore,
    `Auto-grouped from import batch ${recording.importBatchId}`,
  );

  // Link recording to draft
  await db.run(
    `UPDATE recordings SET draftId = ?, updatedAt = datetime('now')
     WHERE id = ? AND orgId = ?`,
    draftId,
    recording.id,
    recording.orgId,
  );

  return { draftId, isNewDraft: true };
}

/**
 * Calculate grouping confidence based on available signals.
 */
function calculateConfidence(
  recording: Recording,
  batchRecordings: Recording[],
): number {
  let confidence = 0.5; // Base confidence

  // Higher confidence if multiple recordings from same batch
  if (batchRecordings.length > 0) {
    confidence += 0.1;
  }

  // Higher confidence if timestamps are close
  if (recording.recorderFileCreatedAt) {
    const closeRecordings = batchRecordings.filter((r) => {
      if (!r.recorderFileCreatedAt) return false;
      const timeDiff = Math.abs(
        new Date(r.recorderFileCreatedAt).getTime() -
          new Date(recording.recorderFileCreatedAt!).getTime(),
      );
      return timeDiff < 30 * 60 * 1000; // 30 minutes
    });
    if (closeRecordings.length > 0) {
      confidence += 0.2;
    }
  }

  return Math.min(confidence, 1.0);
}

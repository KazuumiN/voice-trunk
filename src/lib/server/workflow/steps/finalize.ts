import type { Env } from "../../../types/env.js";
import type { RecordingStatus, WorkflowStepName } from "../../../types/index.js";
import { orgScopedQuery } from "../../db/index.js";
import { WORKFLOW_STEPS } from "../../../constants.js";

/**
 * Step 11: Update recording status to DONE/PARTIAL/ERROR based on completed steps.
 * Also updates the processing_run record.
 */
export async function finalize(
  env: Env,
  recordingId: string,
  orgId: string,
  runId: string,
  completedSteps: WorkflowStepName[],
  failedStep: WorkflowStepName | null,
  error: string | null,
): Promise<{ finalStatus: RecordingStatus }> {
  const db = orgScopedQuery(env.DB, orgId);

  // Determine final status
  // All non-finalize steps should be completed for DONE
  const requiredSteps = WORKFLOW_STEPS.filter((s) => s !== "finalize");
  const allCompleted = requiredSteps.every((s) => completedSteps.includes(s));

  let finalStatus: RecordingStatus;
  let runStatus: string;

  if (allCompleted) {
    finalStatus = "DONE";
    runStatus = "DONE";
  } else if (completedSteps.length > 0 && failedStep) {
    finalStatus = "PARTIAL";
    runStatus = "PARTIAL";
  } else if (failedStep) {
    finalStatus = "ERROR";
    runStatus = "ERROR";
  } else {
    finalStatus = "DONE";
    runStatus = "DONE";
  }

  // Update recording status
  await db.run(
    `UPDATE recordings SET status = ?, updatedAt = datetime('now')
     WHERE id = ? AND orgId = ?`,
    finalStatus,
    recordingId,
    orgId,
  );

  // Update processing_run
  await db.run(
    `UPDATE processing_runs
     SET status = ?,
         completedSteps = ?,
         failedStep = ?,
         error = ?,
         finishedAt = datetime('now')
     WHERE id = ? AND orgId = ?`,
    runStatus,
    JSON.stringify(completedSteps),
    failedStep,
    error,
    runId,
    orgId,
  );

  return { finalStatus };
}

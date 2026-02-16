import type { Env } from "../../../types/env.js";
import type { Recording } from "../../../types/index.js";

/**
 * Step 10: Email notification stub.
 * In MVP, just logs the notification. No actual email sending.
 */
export async function notify(
  env: Env,
  recording: Recording,
  status: "DONE" | "PARTIAL" | "ERROR",
  failedStep?: string,
): Promise<void> {
  const message = status === "DONE"
    ? `Recording ${recording.id} (${recording.originalFileName}) processing completed successfully.`
    : status === "PARTIAL"
      ? `Recording ${recording.id} (${recording.originalFileName}) processing partially completed. Failed at step: ${failedStep ?? "unknown"}.`
      : `Recording ${recording.id} (${recording.originalFileName}) processing failed at step: ${failedStep ?? "unknown"}.`;

  console.log(`[notify] ${message}`);

  // MVP: No actual email sending.
  // Future: Use Resend or similar service.
  // await sendEmail({ to: admin, subject: "Recording Processing Update", body: message });
}

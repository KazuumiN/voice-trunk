import { withAuth, validateBody } from "$lib/server/api/middleware.js";
import { HttpError, jsonResponse } from "$lib/utils/response.js";
import { generateId } from "$lib/utils/id.js";
import { ID_PREFIX, WORKFLOW_STEPS } from "$lib/constants.js";
import type { WorkflowStepName } from "$lib/types/index.js";
import type { RequestHandler } from "./$types.js";

export const POST: RequestHandler = withAuth(
  async ({ request, platform, org, params }) => {
    const env = platform.env;
    const recordingId = params.id;

    const recording = await env.DB.prepare(
      "SELECT id, status FROM recordings WHERE id = ? AND orgId = ?",
    )
      .bind(recordingId, org.orgId)
      .first<{ id: string; status: string }>();

    if (!recording) {
      throw new HttpError(404, "NOT_FOUND", "Recording not found");
    }

    const validStatuses = ["DONE", "PARTIAL", "ERROR"];
    if (!validStatuses.includes(recording.status)) {
      throw new HttpError(
        400,
        "INVALID_STATUS_TRANSITION",
        `Cannot reprocess recording in status ${recording.status}`,
      );
    }

    const body = await validateBody(request, (b) => {
      const obj = b as Record<string, unknown>;
      return {
        provider: (obj.provider as string) || "gemini",
        model: (obj.model as string) || env.DEFAULT_GEMINI_MODEL,
        options: (obj.options as Record<string, unknown>) || {},
        fromStep: (obj.fromStep as WorkflowStepName) || undefined,
      };
    });

    // Validate fromStep
    if (body.fromStep && !WORKFLOW_STEPS.includes(body.fromStep)) {
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        `Invalid step: ${body.fromStep}`,
      );
    }

    // Create new processing run
    const runId = generateId(ID_PREFIX.processingRun);

    // If fromStep, carry over completedSteps from latest run
    let completedSteps: string[] = [];
    if (body.fromStep) {
      const latestRun = await env.DB.prepare(
        "SELECT completedSteps FROM processing_runs WHERE recordingId = ? AND orgId = ? ORDER BY startedAt DESC LIMIT 1",
      )
        .bind(recordingId, org.orgId)
        .first<{ completedSteps: string }>();

      if (latestRun?.completedSteps) {
        const prev = JSON.parse(latestRun.completedSteps) as string[];
        const stepIndex = WORKFLOW_STEPS.indexOf(body.fromStep);
        completedSteps = prev.filter((s) => {
          const idx = WORKFLOW_STEPS.indexOf(s as WorkflowStepName);
          return idx < stepIndex;
        });
      }
    }

    await env.DB.prepare(
      `INSERT INTO processing_runs (id, recordingId, orgId, provider, model, configJson, status, completedSteps, retryCount, startedAt)
       VALUES (?, ?, ?, ?, ?, ?, 'RUNNING', ?, 0, datetime('now'))`,
    )
      .bind(
        runId,
        recordingId,
        org.orgId,
        body.provider,
        body.model,
        JSON.stringify(body.options),
        JSON.stringify(completedSteps),
      )
      .run();

    // Update recording status
    await env.DB.prepare(
      "UPDATE recordings SET status = 'PROCESSING', updatedAt = datetime('now') WHERE id = ? AND orgId = ?",
    )
      .bind(recordingId, org.orgId)
      .run();

    // Start workflow
    await env.RECORDING_PIPELINE.create({
      id: runId,
      params: {
        recordingId,
        orgId: org.orgId,
        runId,
        fromStep: body.fromStep,
      },
    });

    return jsonResponse({ runId, status: "PROCESSING" });
  },
) as RequestHandler;

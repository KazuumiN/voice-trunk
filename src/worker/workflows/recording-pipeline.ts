import {
  WorkflowEntrypoint,
  type WorkflowStep,
  type WorkflowEvent,
} from "cloudflare:workers";
import type { Env } from "../../lib/types/env.js";
import type {
  WorkflowInput,
  WorkflowStepName,
  TranscriptJson,
  Recording,
} from "../../lib/types/index.js";
import { WORKFLOW_STEPS } from "../../lib/constants.js";
import { RETRY_CONFIG } from "../../lib/server/workflow/retry-config.js";
import { loadMetadata } from "../../lib/server/workflow/steps/load-metadata.js";
import {
  ensureAudioAccess,
  type AudioAccessResult,
} from "../../lib/server/workflow/steps/ensure-audio-access.js";
import {
  maybeSplitAudio,
  type SplitResult,
} from "../../lib/server/workflow/steps/maybe-split-audio.js";
import {
  transcribeChunks,
  type ChunkTranscript,
} from "../../lib/server/workflow/steps/transcribe-chunks.js";
import { mergeTranscripts } from "../../lib/server/workflow/steps/merge-transcripts.js";
import { summarize } from "../../lib/server/workflow/steps/summarize.js";
import { claimsExtract } from "../../lib/server/workflow/steps/claims-extract.js";
import { groupRecording } from "../../lib/server/workflow/steps/grouping.js";
import { indexForSearch } from "../../lib/server/workflow/steps/index-for-search.js";
import { notify } from "../../lib/server/workflow/steps/notify.js";
import { finalize } from "../../lib/server/workflow/steps/finalize.js";
import { artifactKey } from "../../lib/server/r2/keys.js";
import { generateId } from "../../lib/utils/id.js";
import { ID_PREFIX } from "../../lib/constants.js";
import { orgScopedQuery } from "../../lib/server/db/index.js";

export class RecordingPipelineWorkflow extends WorkflowEntrypoint<
  Env,
  WorkflowInput
> {
  async run(
    event: WorkflowEvent<WorkflowInput>,
    step: WorkflowStep,
  ): Promise<void> {
    const input = event.payload;
    const { recordingId, orgId, runId, fromStep } = input;

    // Determine which steps to skip
    const startIndex = fromStep
      ? WORKFLOW_STEPS.indexOf(fromStep)
      : 0;

    const completedSteps: WorkflowStepName[] = [];
    let failedStep: WorkflowStepName | null = null;
    let errorMessage: string | null = null;

    // If resuming, load previously completed steps
    if (fromStep && startIndex > 0) {
      const db = orgScopedQuery(this.env.DB, orgId);
      const run = await db.queryFirst<{ completedSteps: string }>(
        `SELECT completedSteps FROM processing_runs WHERE id = ? AND orgId = ?`,
        runId,
        orgId,
      );
      if (run) {
        const prev: string[] = JSON.parse(run.completedSteps);
        for (const s of prev) {
          if (!completedSteps.includes(s as WorkflowStepName)) {
            completedSteps.push(s as WorkflowStepName);
          }
        }
      }
    }

    function shouldRun(stepName: WorkflowStepName): boolean {
      return WORKFLOW_STEPS.indexOf(stepName) >= startIndex;
    }

    // ----- Step 1: load_metadata -----
    let recording: Recording | undefined;

    if (shouldRun("load_metadata")) {
      const result = await step.do(
        "load_metadata",
        RETRY_CONFIG.load_metadata,
        async () => {
          return loadMetadata(this.env, input);
        },
      );
      recording = result.recording;
      completedSteps.push("load_metadata");
    }

    // ----- Step 2: ensure_audio_access -----
    let audioAccess: AudioAccessResult | undefined;

    if (shouldRun("ensure_audio_access")) {
      if (!recording) {
        recording = await this.loadRecording(orgId, recordingId);
      }

      audioAccess = await step.do(
        "ensure_audio_access",
        RETRY_CONFIG.ensure_audio_access,
        async () => {
          return ensureAudioAccess(this.env, recording!);
        },
      );
      completedSteps.push("ensure_audio_access");
    }

    // ----- Step 3: maybe_split_audio -----
    let splitResult: SplitResult | undefined;

    if (shouldRun("maybe_split_audio")) {
      if (!recording) {
        recording = await this.loadRecording(orgId, recordingId);
      }

      if (!audioAccess?.presignedUrl) {
        throw new Error(
          `No presigned URL available for recording ${recordingId}. ` +
            `ensure_audio_access must complete before maybe_split_audio.`,
        );
      }

      splitResult = await step.do(
        "maybe_split_audio",
        RETRY_CONFIG.maybe_split_audio,
        async () => {
          return maybeSplitAudio(
            this.env,
            recording!,
            audioAccess!.presignedUrl,
          );
        },
      );
      completedSteps.push("maybe_split_audio");
    }

    // ----- Step 4: transcribe_chunks -----
    let chunkTranscripts: ChunkTranscript[] | undefined;

    if (shouldRun("transcribe_chunks")) {
      const chunks = splitResult?.chunks ?? [];

      chunkTranscripts = await step.do(
        "transcribe_chunks",
        RETRY_CONFIG.transcribe_chunks,
        async () => {
          return transcribeChunks(
            this.env,
            recordingId,
            orgId,
            runId,
            chunks,
          );
        },
      );
      completedSteps.push("transcribe_chunks");
    }

    // ----- Step 5: merge_transcripts -----
    let transcript: TranscriptJson | undefined;

    if (shouldRun("merge_transcripts")) {
      transcript = await step.do(
        "merge_transcripts",
        RETRY_CONFIG.merge_transcripts,
        async () => {
          const merged = mergeTranscripts(
            chunkTranscripts ?? [],
            recordingId,
            runId,
            "gemini",
            this.env.DEFAULT_GEMINI_MODEL,
          );

          // Save merged transcript to R2
          const r2Key = artifactKey(orgId, recordingId, runId, "transcript.json");
          await this.env.R2_ARTIFACTS.put(r2Key, JSON.stringify(merged));

          // Create artifact record
          const db = orgScopedQuery(this.env.DB, orgId);
          const artifactId = generateId(ID_PREFIX.artifact);
          await db.run(
            `INSERT INTO artifacts (id, runId, orgId, type, r2Key, createdAt)
             VALUES (?, ?, ?, 'transcript', ?, datetime('now'))`,
            artifactId,
            runId,
            orgId,
            r2Key,
          );

          return merged;
        },
      );
      completedSteps.push("merge_transcripts");
    }

    // ----- Step 6: summarize -----
    if (shouldRun("summarize")) {
      // Load transcript from R2 if not available (resuming from this step)
      if (!transcript) {
        transcript = await loadTranscriptFromR2(
          this.env,
          orgId,
          recordingId,
          runId,
        );
      }

      if (transcript) {
        try {
          await step.do("summarize", RETRY_CONFIG.summarize, async () => {
            return summarize(this.env, recordingId, orgId, runId, transcript!);
          });
          completedSteps.push("summarize");
        } catch (err) {
          failedStep = "summarize";
          errorMessage = err instanceof Error ? err.message : String(err);
          // Continue to finalize with PARTIAL status
        }
      }
    }

    // ----- Step 7: claims_extract -----
    if (shouldRun("claims_extract")) {
      if (!transcript) {
        transcript = await loadTranscriptFromR2(
          this.env,
          orgId,
          recordingId,
          runId,
        );
      }

      if (transcript) {
        try {
          await step.do(
            "claims_extract",
            RETRY_CONFIG.claims_extract,
            async () => {
              return claimsExtract(
                this.env,
                recordingId,
                orgId,
                runId,
                transcript!,
              );
            },
          );
          completedSteps.push("claims_extract");
        } catch (err) {
          if (!failedStep) {
            failedStep = "claims_extract";
            errorMessage = err instanceof Error ? err.message : String(err);
          }
        }
      }
    }

    // ----- Step 8: grouping -----
    if (shouldRun("grouping")) {
      if (!recording) {
        recording = await this.loadRecording(orgId, recordingId);
      }

      try {
        await step.do("grouping", RETRY_CONFIG.grouping, async () => {
          return groupRecording(this.env, recording!);
        });
        completedSteps.push("grouping");
      } catch (err) {
        if (!failedStep) {
          failedStep = "grouping";
          errorMessage = err instanceof Error ? err.message : String(err);
        }
      }
    }

    // ----- Step 9: index_for_search (non-critical) -----
    if (shouldRun("index_for_search")) {
      if (!transcript) {
        transcript = await loadTranscriptFromR2(
          this.env,
          orgId,
          recordingId,
          runId,
        );
      }

      if (transcript) {
        try {
          await step.do(
            "index_for_search",
            RETRY_CONFIG.index_for_search,
            async () => {
              return indexForSearch(this.env, orgId, recordingId, transcript!);
            },
          );
          completedSteps.push("index_for_search");
        } catch (err) {
          // Non-critical: log but don't mark as failed
          console.error(
            `[workflow] index_for_search failed for ${recordingId}:`,
            err,
          );
          // Still mark as completed to not block finalization
          completedSteps.push("index_for_search");
        }
      }
    }

    // ----- Step 10: notify -----
    if (shouldRun("notify")) {
      if (!recording) {
        recording = await this.loadRecording(orgId, recordingId);
      }

      const notifyStatus = failedStep
        ? completedSteps.length > 0
          ? "PARTIAL"
          : "ERROR"
        : "DONE";

      try {
        await step.do("notify", RETRY_CONFIG.notify, async () => {
          await notify(
            this.env,
            recording!,
            notifyStatus as "DONE" | "PARTIAL" | "ERROR",
            failedStep ?? undefined,
          );
          return { notified: true };
        });
        completedSteps.push("notify");
      } catch (err) {
        // Notification failure is non-critical
        console.error(`[workflow] notify failed for ${recordingId}:`, err);
        completedSteps.push("notify");
      }
    }

    // ----- Step 11: finalize -----
    await step.do("finalize", RETRY_CONFIG.finalize, async () => {
      return finalize(
        this.env,
        recordingId,
        orgId,
        runId,
        completedSteps,
        failedStep,
        errorMessage,
      );
    });
  }

  /**
   * Load a recording from D1 with a proper null check.
   * Used when resuming from a step that skipped load_metadata.
   */
  private async loadRecording(
    orgId: string,
    recordingId: string,
  ): Promise<Recording> {
    const db = orgScopedQuery(this.env.DB, orgId);
    const recording = await db.queryFirst<Recording>(
      `SELECT * FROM recordings WHERE id = ? AND orgId = ?`,
      recordingId,
      orgId,
    );
    if (!recording) {
      throw new Error(
        `Recording ${recordingId} not found in org ${orgId}`,
      );
    }
    return recording;
  }
}

/**
 * Load a previously saved transcript from R2 (for resume scenarios).
 */
async function loadTranscriptFromR2(
  env: Env,
  orgId: string,
  recordingId: string,
  runId: string,
): Promise<TranscriptJson | undefined> {
  const r2Key = artifactKey(orgId, recordingId, runId, "transcript.json");
  const obj = await env.R2_ARTIFACTS.get(r2Key);
  if (!obj) return undefined;
  const text = await obj.text();
  try {
    return JSON.parse(text) as TranscriptJson;
  } catch {
    throw new Error(
      `Failed to parse transcript from R2 (key: ${r2Key}). ` +
        `Content starts with: ${text.slice(0, 200)}`,
    );
  }
}

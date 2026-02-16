<script lang="ts">
  import * as m from "$lib/paraglide/messages.js";
  import { WORKFLOW_STEPS, POLLING_INTERVAL_MS } from "$lib/constants.js";
  import { getRecording } from "$lib/api/client.js";

  let { recordingId }: { recordingId: string } = $props();

  let completedSteps: string[] = $state([]);
  let failedStep: string | null = $state(null);
  let runStatus: string | null = $state(null);
  let error: string | null = $state(null);

  const STEP_LABELS: Record<string, () => string> = {
    load_metadata: m.step_load_metadata,
    ensure_audio_access: m.step_ensure_audio,
    maybe_split_audio: m.step_split_audio,
    transcribe_chunks: m.step_transcribe,
    merge_transcripts: m.step_merge_transcripts,
    summarize: m.step_summarize,
    claims_extract: m.step_claims_extract,
    grouping: m.step_grouping,
    index_for_search: m.step_index,
    notify: m.step_notify,
    finalize: m.step_finalize,
  };

  function getStepState(step: string): "done" | "failed" | "running" | "pending" {
    if (completedSteps.includes(step)) return "done";
    if (failedStep === step) return "failed";
    if (runStatus === "RUNNING") {
      const completedCount = completedSteps.length;
      const stepIndex = WORKFLOW_STEPS.indexOf(step as typeof WORKFLOW_STEPS[number]);
      if (stepIndex === completedCount) return "running";
    }
    return "pending";
  }

  async function poll() {
    try {
      const data = await getRecording(recordingId);
      if (data.latestRun) {
        completedSteps = data.latestRun.completedSteps;
        failedStep = data.latestRun.failedStep;
        runStatus = data.latestRun.status;
        error = data.latestRun.error;
      }
    } catch {
      // ignore polling errors
    }
  }

  const TERMINAL_STATUSES = ["DONE", "PARTIAL", "ERROR"];

  $effect(() => {
    // Don't start polling if already in terminal state
    if (runStatus && TERMINAL_STATUSES.includes(runStatus)) return;

    poll();
    const interval = setInterval(() => {
      // Stop polling once we reach a terminal state
      if (runStatus && TERMINAL_STATUSES.includes(runStatus)) {
        clearInterval(interval);
        return;
      }
      poll();
    }, POLLING_INTERVAL_MS);
    return () => clearInterval(interval);
  });
</script>

<div class="rounded-lg border border-border bg-white p-4">
  <h3 class="text-sm font-semibold text-gray-700 mb-3">{m.processing_steps()}</h3>
  <ol class="space-y-2">
    {#each WORKFLOW_STEPS as step}
      {@const state = getStepState(step)}
      <li class="flex items-center gap-2 text-sm">
        {#if state === "done"}
          <span class="text-green-500 w-5 text-center">&#10003;</span>
        {:else if state === "failed"}
          <span class="text-red-500 w-5 text-center">&#10007;</span>
        {:else if state === "running"}
          <span class="w-5 text-center">
            <span class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-amber-500 border-t-transparent"></span>
          </span>
        {:else}
          <span class="text-gray-300 w-5 text-center">&#9675;</span>
        {/if}
        <span class:text-gray-400={state === "pending"} class:text-gray-900={state === "done"} class:text-amber-600={state === "running"} class:text-red-600={state === "failed"}>
          {(STEP_LABELS[step] ?? (() => step))()}
        </span>
      </li>
    {/each}
  </ol>
  {#if error}
    <div class="mt-3 rounded bg-red-50 p-2 text-xs text-red-700">
      {error}
    </div>
  {/if}
</div>

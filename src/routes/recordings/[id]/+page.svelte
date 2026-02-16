<script lang="ts">
  import * as m from "$lib/paraglide/messages.js";
  import { getLocale } from "$lib/paraglide/runtime.js";
  import StatusBadge from "$lib/components/StatusBadge.svelte";
  import RecordingProgress from "$lib/components/RecordingProgress.svelte";
  import AudioPlayer from "$lib/components/AudioPlayer.svelte";
  import TranscriptViewer from "$lib/components/TranscriptViewer.svelte";
  import ClaimsPanel from "$lib/components/ClaimsPanel.svelte";
  import { reprocessRecording, getRecordingPresignUrl } from "$lib/api/client.js";
  import type { TranscriptSegment, Claim, SummaryJson } from "$lib/types/index.js";

  let { data } = $props();
  let recording = $derived(data.recording);
  let loadError: string | null = $derived(data.error);

  let audioUrl = $state<string | null>(null);
  let transcript = $state<TranscriptSegment[]>([]);
  let claims = $state<Claim[]>([]);
  let summary = $state<SummaryJson | null>(null);
  let audioPlayer: AudioPlayer | undefined = $state();
  let reprocessing = $state(false);

  // Load presigned URL for audio
  $effect(() => {
    if (!recording) return;
    getRecordingPresignUrl(recording.id)
      .then((res) => {
        audioUrl = res.url;
      })
      .catch(() => {
        // presign not available
      });
  });

  // Load artifacts content
  $effect(() => {
    if (!recording?.artifacts) return;
    for (const art of recording.artifacts) {
      if (art.type === "transcript" && art.r2Key) {
        // Artifact content would be fetched via presigned URL
        // For now, this is a placeholder
      }
    }
  });

  function handleSeek(ms: number) {
    audioPlayer?.seekTo(ms);
  }

  async function handleReprocess() {
    if (!recording) return;
    reprocessing = true;
    try {
      await reprocessRecording(recording.id, {});
      window.location.reload();
    } catch {
      // handle error
    } finally {
      reprocessing = false;
    }
  }

  let canReprocess = $derived(
    recording ? ["DONE", "PARTIAL", "ERROR"].includes(recording.status) : false,
  );
</script>

<svelte:head>
  <title>{m.recording_detail_page_title()}</title>
</svelte:head>

<div class="container-page py-8">
  <div class="mb-6">
    <a href="/" class="text-sm text-gray-500 hover:text-primary">&larr; {m.back_to_dashboard()}</a>
  </div>

  {#if loadError}
    <div class="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
      {loadError}
    </div>
  {:else if !recording}
    <p class="text-sm text-gray-400">{m.recording_not_found()}</p>
  {:else}
  <div class="flex items-start justify-between mb-6">
    <div>
      <h1 class="text-xl font-bold text-gray-900">{recording.originalFileName}</h1>
      <div class="flex items-center gap-3 mt-2">
        <StatusBadge status={recording.status} />
        <span class="text-sm text-gray-500">{(recording.sizeBytes / 1024 / 1024).toFixed(1)} MB</span>
        {#if recording.durationMs}
          <span class="text-sm text-gray-500">
            {m.duration_format({ minutes: String(Math.floor(recording.durationMs / 60000)), seconds: String(Math.floor((recording.durationMs % 60000) / 1000)) })}
          </span>
        {/if}
      </div>
    </div>
    {#if canReprocess}
      <button class="btn-secondary text-sm" onclick={handleReprocess} disabled={reprocessing}>
        {reprocessing ? m.reprocessing() : m.reprocess()}
      </button>
    {/if}
  </div>

  <!-- Metadata -->
  <div class="grid grid-cols-2 gap-4 mb-6 rounded-lg border border-border bg-white p-4 text-sm">
    <div>
      <span class="text-gray-500">{m.device_label()}</span>
      <span class="ml-2 text-gray-900">{recording.deviceId ?? m.direct_upload()}</span>
    </div>
    <div>
      <span class="text-gray-500">{m.batch_id_label()}</span>
      <a href="/batches/{recording.importBatchId}" class="ml-2 text-primary hover:underline">{recording.importBatchId}</a>
    </div>
    {#if recording.workshopId}
      <div>
        <span class="text-gray-500">{m.workshop_label()}</span>
        <a href="/workshops/{recording.workshopId}" class="ml-2 text-primary hover:underline">{recording.workshopId}</a>
      </div>
    {/if}
    {#if recording.draftId}
      <div>
        <span class="text-gray-500">{m.draft_label()}</span>
        <a href="/drafts/{recording.draftId}" class="ml-2 text-primary hover:underline">{recording.draftId}</a>
      </div>
    {/if}
    <div>
      <span class="text-gray-500">{m.mime_label()}</span>
      <span class="ml-2 text-gray-900">{recording.mimeType}</span>
    </div>
    <div>
      <span class="text-gray-500">{m.created_at_label()}</span>
      <span class="ml-2 text-gray-900">{new Date(recording.createdAt).toLocaleString(getLocale())}</span>
    </div>
  </div>

  <!-- Audio Player -->
  {#if audioUrl}
    <section class="mb-6">
      <h2 class="text-base font-semibold text-gray-800 mb-2">{m.audio_player()}</h2>
      <AudioPlayer bind:this={audioPlayer} src={audioUrl} duration={recording.durationMs} />
    </section>
  {/if}

  <!-- Processing Progress -->
  {#if recording.status === "PROCESSING"}
    <section class="mb-6">
      <RecordingProgress recordingId={recording.id} />
    </section>
  {/if}

  <!-- Latest Run Info -->
  {#if recording.latestRun}
    <section class="mb-6 rounded-lg border border-border bg-white p-4">
      <h2 class="text-base font-semibold text-gray-800 mb-2">{m.latest_run()}</h2>
      <div class="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span class="text-gray-500">{m.status_colon()}</span>
          <StatusBadge status={recording.latestRun.status} />
        </div>
        <div>
          <span class="text-gray-500">{m.provider_label()}</span>
          <span class="ml-2 text-gray-900">{recording.latestRun.provider}</span>
        </div>
        <div>
          <span class="text-gray-500">{m.model_label()}</span>
          <span class="ml-2 text-gray-900">{recording.latestRun.model}</span>
        </div>
        <div>
          <span class="text-gray-500">{m.completed_steps_label()}</span>
          <span class="ml-2 text-gray-900">{recording.latestRun.completedSteps.length}/11</span>
        </div>
        {#if recording.latestRun.error}
          <div class="col-span-2">
            <span class="text-gray-500">{m.error_colon()}</span>
            <span class="ml-2 text-red-600">{recording.latestRun.error}</span>
          </div>
        {/if}
      </div>
    </section>
  {/if}

  <!-- Summary -->
  {#if summary}
    <section class="mb-6 rounded-lg border border-border bg-white p-4">
      <h2 class="text-base font-semibold text-gray-800 mb-2">{m.summary()}</h2>
      <p class="text-sm text-gray-700">{summary.shortSummary}</p>
      {#if summary.keyPoints.length > 0}
        <h3 class="text-sm font-medium text-gray-700 mt-3 mb-1">{m.points()}</h3>
        <ul class="list-disc pl-5 text-sm text-gray-600 space-y-1">
          {#each summary.keyPoints as point}
            <li>{point}</li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}

  <!-- Transcript -->
  {#if transcript.length > 0}
    <section class="mb-6">
      <h2 class="text-base font-semibold text-gray-800 mb-2">{m.transcript()}</h2>
      <div class="rounded-lg border border-border bg-white p-4 max-h-[600px] overflow-y-auto">
        <TranscriptViewer segments={transcript} onSeek={handleSeek} />
      </div>
    </section>
  {/if}

  <!-- Claims -->
  {#if claims.length > 0}
    <section class="mb-6">
      <h2 class="text-base font-semibold text-gray-800 mb-2">{m.claims_label()}</h2>
      <div class="rounded-lg border border-border bg-white p-4">
        <ClaimsPanel {claims} />
      </div>
    </section>
  {/if}

  <!-- Artifacts -->
  {#if recording.artifacts && recording.artifacts.length > 0}
    <section class="mb-6 rounded-lg border border-border bg-white p-4">
      <h2 class="text-base font-semibold text-gray-800 mb-2">{m.artifacts()}</h2>
      <div class="space-y-1">
        {#each recording.artifacts as art}
          <div class="flex items-center gap-2 text-sm">
            <span class="text-gray-500">{art.type}</span>
            <span class="text-xs text-gray-400 truncate">{art.r2Key}</span>
          </div>
        {/each}
      </div>
    </section>
  {/if}
  {/if}
</div>

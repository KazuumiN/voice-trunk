<script lang="ts">
  import { onMount } from "svelte";
  import StatusBadge from "$lib/components/StatusBadge.svelte";
  import FileList from "$lib/components/FileList.svelte";
  import { getBatches, cleanCompletedBatches } from "$lib/tauri";
  import { t } from "$lib/i18n/index.svelte";
  import type { BatchState } from "$lib/types";

  let batches = $state<Record<string, BatchState>>({});
  let loading = $state(true);
  let expandedBatchId = $state<string | null>(null);
  let cleaning = $state(false);

  let batchEntries = $derived(Object.entries(batches));
  let hasCompleted = $derived(batchEntries.some(([, b]) => b.status === "COMPLETED"));

  async function loadBatches() {
    loading = true;
    try {
      batches = await getBatches();
    } catch {
      batches = {};
    } finally {
      loading = false;
    }
  }

  async function handleClean() {
    cleaning = true;
    try {
      const count = await cleanCompletedBatches();
      if (count > 0) {
        await loadBatches();
      }
    } catch {
      // ignore
    } finally {
      cleaning = false;
    }
  }

  function toggleExpand(batchId: string) {
    expandedBatchId = expandedBatchId === batchId ? null : batchId;
  }

  onMount(loadBatches);
</script>

<svelte:head>
  <title>{t("batches_title")} - VoiceTrunk</title>
</svelte:head>

<div class="p-6 max-w-4xl mx-auto">
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-gray-900">{t("batches_title")}</h1>
    <div class="flex gap-2">
      {#if hasCompleted}
        <button class="btn-secondary text-sm" onclick={handleClean} disabled={cleaning}>
          {cleaning ? t("cleaning") : t("clean")}
        </button>
      {/if}
      <button class="btn-secondary text-sm" onclick={loadBatches} disabled={loading}>
        {t("refresh")}
      </button>
    </div>
  </div>

  {#if loading}
    <div class="rounded-lg border border-border bg-white p-8 text-center">
      <p class="text-sm text-gray-500">{t("loading")}</p>
    </div>
  {:else if batchEntries.length === 0}
    <div class="rounded-lg border border-border bg-white p-8 text-center">
      <svg class="mx-auto h-10 w-10 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg>
      <p class="text-sm text-gray-500">{t("no_batches")}</p>
    </div>
  {:else}
    <div class="rounded-lg border border-border bg-white divide-y divide-border">
      {#each batchEntries as [batchId, batch]}
        <div>
          <button
            class="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-surface-alt transition-colors"
            onclick={() => toggleExpand(batchId)}
          >
            <div>
              <p class="text-sm font-medium text-gray-900">{batchId}</p>
              <p class="text-xs text-gray-500">{t("device")}: {batch.deviceId} / {Object.keys(batch.files).length}{t("files_count")}</p>
            </div>
            <div class="flex items-center gap-3">
              <StatusBadge status={batch.status} />
              <svg
                class="h-4 w-4 text-gray-400 transition-transform {expandedBatchId === batchId ? 'rotate-180' : ''}"
                fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"
              ><path d="M19 9l-7 7-7-7"/></svg>
            </div>
          </button>
          {#if expandedBatchId === batchId}
            <div class="px-4 pb-4">
              <FileList files={batch.files} />
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

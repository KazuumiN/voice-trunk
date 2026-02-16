<script lang="ts">
  import StatusBadge from "$lib/components/StatusBadge.svelte";
  import type { Recording } from "$lib/types/index.js";
  import * as m from "$lib/paraglide/messages.js";

  let { data } = $props();
  let recordings: Recording[] = $derived(data.recordings);

  // Group recordings by device
  let grouped = $derived(() => {
    const map = new Map<string, Recording[]>();
    for (const rec of recordings) {
      const key = rec.deviceId || "direct-upload";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(rec);
    }
    return [...map.entries()];
  });

  function progressPercent(rec: Recording): number {
    if (rec.status === "DONE") return 100;
    if (rec.status === "UPLOADED") return 50;
    if (rec.status === "UPLOADING") return 25;
    if (rec.status === "PROCESSING") return 75;
    return 0;
  }
</script>

<svelte:head>
  <title>{m.batch_detail_page_title()}</title>
</svelte:head>

<div class="container-page py-8">
  <div class="mb-6">
    <a href="/batches" class="text-sm text-gray-500 hover:text-primary">&larr; {m.back_to_batches()}</a>
  </div>

  <h1 class="text-2xl font-bold text-gray-900 mb-2">{m.batch_detail()}</h1>
  <p class="text-sm text-gray-500 mb-6">ID: {data.batchId}</p>

  {#each grouped() as [deviceId, recs]}
    <section class="mb-6">
      <h2 class="text-base font-semibold text-gray-700 mb-3">{m.device_prefix()} {deviceId === "direct-upload" ? m.direct_upload() : deviceId}</h2>
      <div class="space-y-2">
        {#each recs as rec}
          <div class="flex items-center gap-4 rounded-lg border border-border bg-white p-3">
            <div class="flex-1 min-w-0">
              <a href="/recordings/{rec.id}" class="text-sm font-medium text-primary hover:underline truncate block">{rec.originalFileName}</a>
              <p class="text-xs text-gray-500 mt-0.5">{(rec.sizeBytes / 1024 / 1024).toFixed(1)} MB</p>
            </div>
            <StatusBadge status={rec.status} />
            <div class="w-32">
              <div class="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  class="h-full rounded-full transition-all {rec.status === 'ERROR' ? 'bg-red-500' : rec.status === 'DONE' ? 'bg-green-500' : 'bg-primary'}"
                  style="width: {progressPercent(rec)}%"
                ></div>
              </div>
            </div>
          </div>
        {/each}
      </div>
    </section>
  {/each}

  {#if recordings.length === 0}
    <p class="text-sm text-gray-400 rounded-lg border border-border bg-white p-6 text-center">{m.no_recordings()}</p>
  {/if}
</div>

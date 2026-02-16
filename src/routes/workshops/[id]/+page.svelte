<script lang="ts">
  import StatusBadge from "$lib/components/StatusBadge.svelte";
  import { exportWorkshop } from "$lib/api/client.js";
  import type { Recording, Workshop } from "$lib/types/index.js";
  import * as m from "$lib/paraglide/messages.js";
  import { getLocale } from "$lib/paraglide/runtime.js";

  let { data } = $props();
  let workshop: Workshop | null = $derived(data.workshop);
  let recordings: Recording[] = $derived(data.recordings);
  let error: string | null = $derived(data.error);
  let exporting = $state(false);
  let exportError = $state<string | null>(null);
  let exportResult: { recordingCount: number; artifacts: unknown[] } | null = $state(null);

  async function handleExport() {
    if (!workshop) return;
    exporting = true;
    exportError = null;
    try {
      const result = await exportWorkshop(workshop.id);
      exportResult = result;
    } catch (err) {
      exportError = err instanceof Error ? err.message : m.export_failed();
    } finally {
      exporting = false;
    }
  }
</script>

<svelte:head>
  <title>{m.workshop_detail_page_title({ title: workshop?.title ?? m.workshop_detail_default_title() })}</title>
</svelte:head>

<div class="container-page py-8">
  <div class="mb-6">
    <a href="/workshops" class="text-sm text-gray-500 hover:text-primary">&larr; {m.back_to_workshops()}</a>
  </div>

  {#if error}
    <div class="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
      {error}
    </div>
  {:else if !workshop}
    <p class="text-sm text-gray-400">{m.workshop_not_found()}</p>
  {:else}
    <div class="flex items-start justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">{workshop.title}</h1>
        <div class="flex items-center gap-4 mt-2 text-sm text-gray-500">
          <span>{new Date(workshop.date).toLocaleDateString(getLocale())}</span>
          <span>{workshop.location}</span>
        </div>
        <p class="mt-1 text-xs text-gray-400">ID: {workshop.id}</p>
      </div>
      <button class="btn-primary text-sm" onclick={handleExport} disabled={exporting}>
        {exporting ? m.exporting() : m.export_btn()}
      </button>
    </div>

    {#if exportError}
      <div class="mb-6 rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
        {exportError}
      </div>
    {/if}

    {#if exportResult}
      <div class="mb-6 rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-800">
        {m.export_complete({ recordingCount: String(exportResult.recordingCount), artifactCount: String(exportResult.artifacts.length) })}
      </div>
    {/if}

    <!-- Linked Recordings -->
    <section>
      <h2 class="text-lg font-semibold text-gray-800 mb-3">{m.related_recordings({ count: String(recordings.length) })}</h2>
      {#if recordings.length === 0}
        <p class="text-sm text-gray-400 rounded-lg border border-border bg-white p-4">{m.no_related_recordings()}</p>
      {:else}
        <div class="overflow-hidden rounded-lg border border-border bg-white">
          <table class="w-full text-sm">
            <thead class="bg-surface-alt text-left text-xs text-gray-500">
              <tr>
                <th class="px-4 py-2 font-medium">{m.file_name()}</th>
                <th class="px-4 py-2 font-medium">{m.status_label()}</th>
                <th class="px-4 py-2 font-medium">{m.size_label()}</th>
                <th class="px-4 py-2 font-medium">{m.created_at()}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              {#each recordings as rec}
                <tr class="hover:bg-surface-alt/50">
                  <td class="px-4 py-2">
                    <a href="/recordings/{rec.id}" class="text-primary hover:underline font-medium">{rec.originalFileName}</a>
                  </td>
                  <td class="px-4 py-2"><StatusBadge status={rec.status} /></td>
                  <td class="px-4 py-2 text-gray-600">{(rec.sizeBytes / 1024 / 1024).toFixed(1)} MB</td>
                  <td class="px-4 py-2 text-gray-500">{new Date(rec.createdAt).toLocaleDateString(getLocale())}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  {/if}
</div>

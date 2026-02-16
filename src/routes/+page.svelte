<script lang="ts">
  import StatusBadge from "$lib/components/StatusBadge.svelte";
  import { getImportBatches, getRecordings } from "$lib/api/client.js";
  import type { ImportBatch, Recording } from "$lib/types/index.js";
  import * as m from "$lib/paraglide/messages.js";
  import { getLocale } from "$lib/paraglide/runtime.js";

  let recentBatches: ImportBatch[] = $state([]);
  let processingRecordings: Recording[] = $state([]);
  let errorRecordings: Recording[] = $state([]);
  let loading = $state(true);

  async function loadDashboard() {
    try {
      const [batchRes, processingRes, errorRes] = await Promise.all([
        getImportBatches({ limit: 5 }),
        getRecordings({ status: "PROCESSING", limit: 10 }),
        getRecordings({ status: "ERROR", limit: 10 }),
      ]);
      recentBatches = batchRes.data;
      processingRecordings = processingRes.data;
      errorRecordings = errorRes.data;
    } catch {
      // API may not be available yet
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    loadDashboard();
  });
</script>

<svelte:head>
  <title>{m.dashboard_page_title()}</title>
</svelte:head>

<div class="container-page py-8">
  <h1 class="text-2xl font-bold text-gray-900">{m.dashboard_title()}</h1>
  <p class="mt-1 text-sm text-gray-500">{m.dashboard_description()}</p>

  {#if loading}
    <div class="mt-8 text-sm text-gray-400">{m.loading()}</div>
  {:else}
    <div class="mt-8 grid gap-6">
      <!-- Recent Batches -->
      <section>
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-semibold text-gray-800">{m.recent_batches()}</h2>
          <a href="/batches" class="text-sm text-primary hover:underline">{m.show_all()}</a>
        </div>
        {#if recentBatches.length === 0}
          <p class="text-sm text-gray-400 rounded-lg border border-border bg-white p-4">{m.no_batches()}</p>
        {:else}
          <div class="overflow-hidden rounded-lg border border-border bg-white">
            <table class="w-full text-sm">
              <thead class="bg-surface-alt text-left text-xs text-gray-500">
                <tr>
                  <th class="px-4 py-2 font-medium">ID</th>
                  <th class="px-4 py-2 font-medium">{m.status_label()}</th>
                  <th class="px-4 py-2 font-medium">{m.file_count()}</th>
                  <th class="px-4 py-2 font-medium">{m.started_at()}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                {#each recentBatches as batch}
                  <tr class="hover:bg-surface-alt/50">
                    <td class="px-4 py-2">
                      <a href="/batches/{batch.id}" class="text-primary hover:underline font-medium">{batch.id}</a>
                    </td>
                    <td class="px-4 py-2"><StatusBadge status={batch.status} /></td>
                    <td class="px-4 py-2 text-gray-600">{batch.uploadedFiles}/{batch.totalFiles}</td>
                    <td class="px-4 py-2 text-gray-500">{new Date(batch.startedAt).toLocaleString(getLocale())}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </section>

      <!-- Processing Recordings -->
      <section>
        <h2 class="text-lg font-semibold text-gray-800 mb-3">{m.processing_recordings()}</h2>
        {#if processingRecordings.length === 0}
          <p class="text-sm text-gray-400 rounded-lg border border-border bg-white p-4">{m.no_processing_recordings()}</p>
        {:else}
          <div class="overflow-hidden rounded-lg border border-border bg-white">
            <table class="w-full text-sm">
              <thead class="bg-surface-alt text-left text-xs text-gray-500">
                <tr>
                  <th class="px-4 py-2 font-medium">{m.file_name()}</th>
                  <th class="px-4 py-2 font-medium">{m.status_label()}</th>
                  <th class="px-4 py-2 font-medium">{m.updated_at()}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                {#each processingRecordings as rec}
                  <tr class="hover:bg-surface-alt/50">
                    <td class="px-4 py-2">
                      <a href="/recordings/{rec.id}" class="text-primary hover:underline font-medium">{rec.originalFileName}</a>
                    </td>
                    <td class="px-4 py-2"><StatusBadge status={rec.status} /></td>
                    <td class="px-4 py-2 text-gray-500">{new Date(rec.updatedAt).toLocaleString(getLocale())}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </section>

      <!-- Error Recordings -->
      <section>
        <h2 class="text-lg font-semibold text-gray-800 mb-3">{m.error_recordings()}</h2>
        {#if errorRecordings.length === 0}
          <p class="text-sm text-gray-400 rounded-lg border border-border bg-white p-4">{m.no_errors()}</p>
        {:else}
          <div class="overflow-hidden rounded-lg border border-border bg-white">
            <table class="w-full text-sm">
              <thead class="bg-surface-alt text-left text-xs text-gray-500">
                <tr>
                  <th class="px-4 py-2 font-medium">{m.file_name()}</th>
                  <th class="px-4 py-2 font-medium">{m.status_label()}</th>
                  <th class="px-4 py-2 font-medium">{m.updated_at()}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                {#each errorRecordings as rec}
                  <tr class="hover:bg-surface-alt/50">
                    <td class="px-4 py-2">
                      <a href="/recordings/{rec.id}" class="text-primary hover:underline font-medium">{rec.originalFileName}</a>
                    </td>
                    <td class="px-4 py-2"><StatusBadge status={rec.status} /></td>
                    <td class="px-4 py-2 text-gray-500">{new Date(rec.updatedAt).toLocaleString(getLocale())}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </section>
    </div>
  {/if}
</div>

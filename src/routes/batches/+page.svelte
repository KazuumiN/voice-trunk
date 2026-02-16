<script lang="ts">
  import StatusBadge from "$lib/components/StatusBadge.svelte";
  import Pagination from "$lib/components/Pagination.svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import type { ImportBatch, PaginationResult } from "$lib/types/index.js";
  import * as m from "$lib/paraglide/messages.js";
  import { getLocale } from "$lib/paraglide/runtime.js";

  let { data } = $props();
  let batches: ImportBatch[] = $derived(data.batches);
  let pagination: PaginationResult = $derived(data.pagination);

  let statusFilter = $state($page.url.searchParams.get("status") ?? "");

  const statuses = ["", "OPEN", "UPLOADING", "COMPLETED", "PARTIAL_ERROR"];

  function applyFilter() {
    const q = new URLSearchParams();
    if (statusFilter) q.set("status", statusFilter);
    goto(`/batches?${q.toString()}`);
  }

  function loadMore(cursor: string) {
    const q = new URLSearchParams($page.url.searchParams);
    q.set("cursor", cursor);
    goto(`/batches?${q.toString()}`);
  }
</script>

<svelte:head>
  <title>{m.batches_page_title()}</title>
</svelte:head>

<div class="container-page py-8">
  <h1 class="text-2xl font-bold text-gray-900 mb-6">{m.batches_title()}</h1>

  <div class="flex items-end gap-3 mb-6">
    <div>
      <label class="block text-xs text-gray-500 mb-1" for="statusFilter">{m.status_label()}</label>
      <select id="statusFilter" bind:value={statusFilter} onchange={applyFilter} class="rounded border border-border px-3 py-1.5 text-sm bg-white">
        {#each statuses as s}
          <option value={s}>{s || m.all()}</option>
        {/each}
      </select>
    </div>
  </div>

  {#if batches.length === 0}
    <p class="text-sm text-gray-400 rounded-lg border border-border bg-white p-6 text-center">{m.no_batches()}</p>
  {:else}
    <div class="overflow-hidden rounded-lg border border-border bg-white">
      <table class="w-full text-sm">
        <thead class="bg-surface-alt text-left text-xs text-gray-500">
          <tr>
            <th class="px-4 py-2 font-medium">ID</th>
            <th class="px-4 py-2 font-medium">{m.status_label()}</th>
            <th class="px-4 py-2 font-medium">{m.files_label()}</th>
            <th class="px-4 py-2 font-medium">{m.error_label()}</th>
            <th class="px-4 py-2 font-medium">{m.started_at()}</th>
            <th class="px-4 py-2 font-medium">{m.notes_label()}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          {#each batches as batch}
            <tr class="hover:bg-surface-alt/50">
              <td class="px-4 py-2">
                <a href="/batches/{batch.id}" class="text-primary hover:underline font-medium">{batch.id}</a>
              </td>
              <td class="px-4 py-2"><StatusBadge status={batch.status} /></td>
              <td class="px-4 py-2 text-gray-600">{batch.uploadedFiles}/{batch.totalFiles}</td>
              <td class="px-4 py-2 text-gray-600">{batch.errorFiles}</td>
              <td class="px-4 py-2 text-gray-500">{new Date(batch.startedAt).toLocaleString(getLocale())}</td>
              <td class="px-4 py-2 text-gray-500 truncate max-w-[200px]">{batch.notes || "-"}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <Pagination hasMore={pagination.hasMore} nextCursor={pagination.nextCursor} totalCount={pagination.totalCount} onPageChange={loadMore} />
  {/if}
</div>

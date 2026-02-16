<script lang="ts">
  import StatusBadge from "$lib/components/StatusBadge.svelte";
  import Pagination from "$lib/components/Pagination.svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import type { Workshop, PaginationResult } from "$lib/types/index.js";
  import * as m from "$lib/paraglide/messages.js";
  import { getLocale } from "$lib/paraglide/runtime.js";

  let { data } = $props();
  let workshops: Workshop[] = $derived(data.workshops);
  let pagination: PaginationResult = $derived(data.pagination);

  let dateFrom = $state($page.url.searchParams.get("dateFrom") ?? "");
  let dateTo = $state($page.url.searchParams.get("dateTo") ?? "");
  let locationSearch = $state($page.url.searchParams.get("location") ?? "");

  function applyFilters() {
    const q = new URLSearchParams();
    if (dateFrom) q.set("dateFrom", dateFrom);
    if (dateTo) q.set("dateTo", dateTo);
    if (locationSearch) q.set("location", locationSearch);
    goto(`/workshops?${q.toString()}`);
  }

  function loadMore(cursor: string) {
    const q = new URLSearchParams($page.url.searchParams);
    q.set("cursor", cursor);
    goto(`/workshops?${q.toString()}`);
  }
</script>

<svelte:head>
  <title>{m.workshops_page_title()}</title>
</svelte:head>

<div class="container-page py-8">
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-gray-900">{m.workshops_title()}</h1>
    <a href="/admin/workshops/new" class="btn-primary text-sm">{m.create_new()}</a>
  </div>

  <!-- Filters -->
  <div class="flex flex-wrap items-end gap-3 mb-6">
    <div>
      <label class="block text-xs text-gray-500 mb-1" for="dateFrom">{m.date_from()}</label>
      <input id="dateFrom" type="date" bind:value={dateFrom} class="rounded border border-border px-3 py-1.5 text-sm" />
    </div>
    <div>
      <label class="block text-xs text-gray-500 mb-1" for="dateTo">{m.date_to()}</label>
      <input id="dateTo" type="date" bind:value={dateTo} class="rounded border border-border px-3 py-1.5 text-sm" />
    </div>
    <div>
      <label class="block text-xs text-gray-500 mb-1" for="location">{m.location_label()}</label>
      <input id="location" type="text" bind:value={locationSearch} placeholder={m.search_by_location()} class="rounded border border-border px-3 py-1.5 text-sm" />
    </div>
    <button class="btn-secondary text-sm" onclick={applyFilters}>{m.apply_filter()}</button>
  </div>

  {#if workshops.length === 0}
    <p class="text-sm text-gray-400 rounded-lg border border-border bg-white p-6 text-center">{m.no_workshops()}</p>
  {:else}
    <div class="overflow-hidden rounded-lg border border-border bg-white">
      <table class="w-full text-sm">
        <thead class="bg-surface-alt text-left text-xs text-gray-500">
          <tr>
            <th class="px-4 py-2 font-medium">{m.title_label()}</th>
            <th class="px-4 py-2 font-medium">{m.date_label()}</th>
            <th class="px-4 py-2 font-medium">{m.location_label()}</th>
            <th class="px-4 py-2 font-medium">{m.created_at()}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          {#each workshops as ws}
            <tr class="hover:bg-surface-alt/50">
              <td class="px-4 py-2">
                <a href="/workshops/{ws.id}" class="text-primary hover:underline font-medium">{ws.title}</a>
              </td>
              <td class="px-4 py-2 text-gray-600">{ws.date}</td>
              <td class="px-4 py-2 text-gray-600">{ws.location || "-"}</td>
              <td class="px-4 py-2 text-gray-500">{new Date(ws.createdAt).toLocaleDateString(getLocale())}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <Pagination hasMore={pagination.hasMore} nextCursor={pagination.nextCursor} totalCount={pagination.totalCount} onPageChange={loadMore} />
  {/if}
</div>

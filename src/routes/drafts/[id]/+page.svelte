<script lang="ts">
  import StatusBadge from "$lib/components/StatusBadge.svelte";
  import { confirmDraft } from "$lib/api/client.js";
  import { goto } from "$app/navigation";
  import type { Recording, WorkshopDraft } from "$lib/types/index.js";
  import * as m from "$lib/paraglide/messages.js";

  let { data } = $props();
  let draft: WorkshopDraft | null = $derived(data.draft);
  let recordings: Recording[] = $derived(data.recordings);
  let loadError: string | null = $derived(data.error);

  // Confirm modal state
  let showConfirmModal = $state(false);
  let confirmTitle = $state("");
  let confirmDate = $state("");
  let confirmLocation = $state("");
  let submitting = $state(false);

  function openConfirmModal() {
    confirmTitle = draft?.title ?? "";
    confirmDate = "";
    confirmLocation = "";
    showConfirmModal = true;
  }

  async function handleConfirm() {
    if (!draft || !confirmTitle || !confirmDate) return;
    submitting = true;
    try {
      const result = await confirmDraft(draft.id, {
        title: confirmTitle,
        date: confirmDate,
        location: confirmLocation,
      });
      showConfirmModal = false;
      goto(`/workshops/${result.workshopId}`);
    } catch {
      // handle error
    } finally {
      submitting = false;
    }
  }
</script>

<svelte:head>
  <title>{m.draft_detail_page_title()}</title>
</svelte:head>

<div class="container-page py-8">
  <div class="mb-6">
    <a href="/drafts" class="text-sm text-gray-500 hover:text-primary">&larr; {m.back_to_drafts()}</a>
  </div>

  {#if loadError}
    <div class="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
      {loadError}
    </div>
  {:else if !draft}
    <p class="text-sm text-gray-400">{m.draft_not_found()}</p>
  {:else}
    <div class="flex items-start justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">{draft.title || m.untitled_draft()}</h1>
        <div class="flex items-center gap-3 mt-2">
          <StatusBadge status={draft.status} />
          <span class="text-sm text-gray-500">{m.confidence_score({ score: (draft.confidenceScore * 100).toFixed(0) })}</span>
        </div>
        {#if draft.reason}
          <p class="mt-2 text-sm text-gray-600">{draft.reason}</p>
        {/if}
      </div>

      {#if draft.status === "DRAFT"}
        <div class="flex gap-2">
          <button class="btn-primary text-sm" onclick={openConfirmModal}>{m.confirm_btn()}</button>
        </div>
      {/if}
    </div>

    {#if draft.confirmedWorkshopId}
      <div class="mb-6 rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-800">
        {m.confirmed_prefix()} <a href="/workshops/{draft.confirmedWorkshopId}" class="text-primary hover:underline">{draft.confirmedWorkshopId}</a>
      </div>
    {/if}

    <!-- Related Recordings -->
    <section>
      <h2 class="text-lg font-semibold text-gray-800 mb-3">{m.related_recordings({ count: String(recordings.length) })}</h2>
      {#if recordings.length === 0}
        <p class="text-sm text-gray-400 rounded-lg border border-border bg-white p-4">{m.no_recordings()}</p>
      {:else}
        <div class="overflow-hidden rounded-lg border border-border bg-white">
          <table class="w-full text-sm">
            <thead class="bg-surface-alt text-left text-xs text-gray-500">
              <tr>
                <th class="px-4 py-2 font-medium">{m.file_name()}</th>
                <th class="px-4 py-2 font-medium">{m.status_label()}</th>
                <th class="px-4 py-2 font-medium">{m.size_label()}</th>
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
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  {/if}
</div>

<!-- Confirm Modal -->
{#if showConfirmModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
    <div class="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
      <h2 class="text-lg font-bold text-gray-900 mb-4">{m.confirm_as_workshop()}</h2>
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1" for="confirm-title">{m.title_label()}</label>
          <input id="confirm-title" type="text" bind:value={confirmTitle} class="w-full rounded border border-border px-3 py-2 text-sm" required />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1" for="confirm-date">{m.date_label()}</label>
          <input id="confirm-date" type="date" bind:value={confirmDate} class="w-full rounded border border-border px-3 py-2 text-sm" required />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1" for="confirm-location">{m.location_label()}</label>
          <input id="confirm-location" type="text" bind:value={confirmLocation} class="w-full rounded border border-border px-3 py-2 text-sm" />
        </div>
      </div>
      <div class="flex justify-end gap-2 mt-6">
        <button class="btn-secondary text-sm" onclick={() => (showConfirmModal = false)}>{m.cancel()}</button>
        <button class="btn-primary text-sm" onclick={handleConfirm} disabled={submitting || !confirmTitle || !confirmDate}>
          {submitting ? m.confirming_workshop() : m.confirm_action()}
        </button>
      </div>
    </div>
  </div>
{/if}

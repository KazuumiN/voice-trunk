<script lang="ts">
  import * as m from "$lib/paraglide/messages.js";
  import { createWorkshop } from "$lib/api/client.js";
  import { goto } from "$app/navigation";

  let title = $state("");
  let date = $state("");
  let location = $state("");
  let submitting = $state(false);
  let errorMsg = $state("");

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!title || !date) return;
    submitting = true;
    errorMsg = "";
    try {
      const ws = await createWorkshop({ title, date, location });
      goto(`/workshops/${ws.id}`);
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : m.create_failed();
    } finally {
      submitting = false;
    }
  }
</script>

<svelte:head>
  <title>{m.workshop_create_page_title()}</title>
</svelte:head>

<div class="container-page py-8">
  <div class="mb-6">
    <a href="/workshops" class="text-sm text-gray-500 hover:text-primary">&larr; {m.back_to_workshops()}</a>
  </div>

  <h1 class="text-2xl font-bold text-gray-900 mb-6">{m.workshop_create_title()}</h1>

  <form onsubmit={handleSubmit} class="max-w-lg space-y-4">
    <div>
      <label class="block text-sm font-medium text-gray-700 mb-1" for="ws-title">{m.title_label()}</label>
      <input
        id="ws-title"
        type="text"
        bind:value={title}
        required
        class="w-full rounded border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        placeholder={m.workshop_title_placeholder()}
      />
    </div>

    <div>
      <label class="block text-sm font-medium text-gray-700 mb-1" for="ws-date">{m.date_label()}</label>
      <input
        id="ws-date"
        type="date"
        bind:value={date}
        required
        class="w-full rounded border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>

    <div>
      <label class="block text-sm font-medium text-gray-700 mb-1" for="ws-location">{m.location_label()}</label>
      <input
        id="ws-location"
        type="text"
        bind:value={location}
        class="w-full rounded border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        placeholder={m.location_placeholder()}
      />
    </div>

    {#if errorMsg}
      <div class="rounded bg-red-50 p-3 text-sm text-red-700">{errorMsg}</div>
    {/if}

    <div class="flex gap-2 pt-2">
      <button type="submit" class="btn-primary text-sm" disabled={submitting || !title || !date}>
        {submitting ? m.creating() : m.create()}
      </button>
      <a href="/workshops" class="btn-secondary text-sm">{m.cancel()}</a>
    </div>
  </form>
</div>

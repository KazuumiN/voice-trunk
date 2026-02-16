<script lang="ts">
  import type { MountInfo, RecorderIdentifier } from "$lib/types";
  import { startImport } from "$lib/tauri";
  import { appStore } from "$lib/stores.svelte";
  import { t } from "$lib/i18n/index.svelte";

  let { mount, identifier }: { mount: MountInfo; identifier: RecorderIdentifier | null } = $props();

  let importing = $state(false);
  let error = $state<string | null>(null);

  let isImporting = $derived(appStore.currentImportBatchId !== null);

  async function handleImport() {
    if (!identifier) return;
    importing = true;
    error = null;
    try {
      await startImport(mount.path, identifier.deviceId);
    } catch (err) {
      error = err instanceof Error ? err.message : t("import_failed");
    } finally {
      importing = false;
    }
  }
</script>

<div class="rounded-lg border border-border bg-white p-4">
  <div class="flex items-start justify-between">
    <div class="flex items-start gap-3">
      <div class="mt-0.5">
        <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"/></svg>
      </div>
      <div>
        <p class="text-sm font-medium text-gray-900">
          {identifier?.label ?? mount.name}
        </p>
        <p class="text-xs text-gray-500 mt-0.5">{mount.path}</p>
        {#if identifier}
          <p class="text-xs text-gray-400 mt-0.5 font-mono">{identifier.deviceId}</p>
        {:else if mount.hasRecorderId}
          <p class="text-xs text-yellow-600 mt-0.5">{t("id_file_found")}</p>
        {:else}
          <p class="text-xs text-gray-400 mt-0.5">{t("no_id_file")}</p>
        {/if}
      </div>
    </div>
    {#if identifier}
      <button
        class="btn-primary text-sm"
        onclick={handleImport}
        disabled={importing || isImporting}
      >
        {importing ? t("starting") : t("import_btn")}
      </button>
    {/if}
  </div>
  {#if error}
    <div class="mt-2 rounded border border-red-200 bg-red-50 px-3 py-1.5">
      <p class="text-xs text-red-600">{error}</p>
    </div>
  {/if}
</div>

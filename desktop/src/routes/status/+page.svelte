<script lang="ts">
  import { onMount } from "svelte";
  import DeviceCard from "$lib/components/DeviceCard.svelte";
  import ProgressBar from "$lib/components/ProgressBar.svelte";
  import ImportLog from "$lib/components/ImportLog.svelte";
  import StatusBadge from "$lib/components/StatusBadge.svelte";
  import { appStore } from "$lib/stores.svelte";
  import { identifyDevice, checkFfmpeg, getBatches } from "$lib/tauri";
  import { t } from "$lib/i18n/index.svelte";
  import type { RecorderIdentifier, BatchState } from "$lib/types";

  let identifiers = $state<Record<string, RecorderIdentifier | null>>({});
  let ffmpegAvailable = $state<boolean | null>(null);
  let batches = $state<Record<string, BatchState>>({});

  let importPercent = $derived(
    appStore.importProgress?.total
      ? Math.round((appStore.importProgress.current / appStore.importProgress.total) * 100)
      : 0,
  );

  let recentBatchEntries = $derived(
    Object.entries(batches).slice(0, 5),
  );

  onMount(async () => {
    ffmpegAvailable = await checkFfmpeg().catch(() => false);

    try {
      batches = await getBatches();
    } catch {
      batches = {};
    }

    for (const device of appStore.connectedDevices) {
      try {
        identifiers[device.path] = await identifyDevice(device.path);
      } catch {
        identifiers[device.path] = null;
      }
    }
  });
</script>

<svelte:head>
  <title>{t("status_title")} - VoiceTrunk</title>
</svelte:head>

<div class="p-6 max-w-4xl mx-auto space-y-6">
  <h1 class="text-2xl font-bold text-gray-900">{t("status_title")}</h1>

  <!-- ffmpeg warning -->
  {#if ffmpegAvailable === false}
    <div class="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
      <div class="flex items-start gap-3">
        <svg class="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>
        <div>
          <p class="text-sm font-medium text-yellow-800">{t("ffmpeg_not_found")}</p>
          <p class="text-sm text-yellow-700 mt-1">{t("ffmpeg_not_found_detail")}</p>
        </div>
      </div>
    </div>
  {/if}

  <!-- Active import -->
  {#if appStore.currentImportBatchId && appStore.importProgress}
    <div class="rounded-lg border border-border bg-white p-5">
      <h2 class="text-lg font-semibold text-gray-900 mb-3">{t("importing")}</h2>
      <div class="space-y-3">
        <ProgressBar progress={importPercent} label="{appStore.importProgress.current} / {appStore.importProgress.total} {t('files_count')}" />
        <ImportLog progress={appStore.importProgress} />
      </div>
    </div>
  {/if}

  <!-- Connected devices -->
  <div>
    <h2 class="text-lg font-semibold text-gray-900 mb-3">{t("connected_devices")}</h2>
    {#if appStore.connectedDevices.length === 0}
      <div class="rounded-lg border border-border bg-white p-8 text-center">
        <svg class="mx-auto h-10 w-10 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"/></svg>
        <p class="text-sm text-gray-500">{t("no_devices")}</p>
        <p class="text-xs text-gray-400 mt-1">{t("no_devices_hint")}</p>
      </div>
    {:else}
      <div class="grid gap-3">
        {#each appStore.connectedDevices as mount}
          <DeviceCard {mount} identifier={identifiers[mount.path] ?? null} />
        {/each}
      </div>
    {/if}
  </div>

  <!-- Recent batches -->
  {#if recentBatchEntries.length > 0}
    <div>
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-lg font-semibold text-gray-900">{t("recent_batches")}</h2>
        <a href="/batches" class="text-sm text-primary hover:underline">{t("show_all")}</a>
      </div>
      <div class="rounded-lg border border-border bg-white divide-y divide-border">
        {#each recentBatchEntries as [batchId, batch]}
          <div class="flex items-center justify-between px-4 py-3">
            <div>
              <p class="text-sm font-medium text-gray-900">{batchId}</p>
              <p class="text-xs text-gray-500">{batch.deviceId} - {Object.keys(batch.files).length}{t("files_count")}</p>
            </div>
            <StatusBadge status={batch.status} />
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

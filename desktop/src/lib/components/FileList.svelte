<script lang="ts">
  import type { FileStatus } from "$lib/types";
  import { t } from "$lib/i18n/index.svelte";

  let { files }: { files: Record<string, FileStatus> } = $props();

  let entries = $derived(Object.entries(files));

  function statusLabel(fs: FileStatus): string {
    if (fs.error) return t("error");
    if (fs.uploaded) return t("done");
    if (fs.multipartUploadId) return t("uploading");
    return t("pending");
  }

  function statusColor(fs: FileStatus): string {
    if (fs.error) return "text-red-600";
    if (fs.uploaded) return "text-green-600";
    if (fs.multipartUploadId) return "text-yellow-600";
    return "text-gray-500";
  }
</script>

{#if entries.length === 0}
  <p class="text-sm text-gray-500 py-2">{t("no_files")}</p>
{:else}
  <div class="divide-y divide-border rounded-lg border border-border overflow-hidden">
    {#each entries as [fileName, fs]}
      <div class="flex items-center gap-3 px-3 py-2 bg-white">
        <div class="flex-1 min-w-0">
          <p class="text-sm text-gray-900 truncate">{fileName}</p>
          {#if fs.recordingId}
            <p class="text-xs text-gray-400 font-mono">{fs.recordingId}</p>
          {/if}
        </div>
        <span class="text-xs font-medium {statusColor(fs)} shrink-0">
          {statusLabel(fs)}
        </span>
      </div>
      {#if fs.error}
        <div class="px-3 py-1.5 bg-red-50">
          <p class="text-xs text-red-600">{fs.error}</p>
        </div>
      {/if}
    {/each}
  </div>
{/if}

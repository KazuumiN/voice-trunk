<script lang="ts">
  import type { ImportProgress } from "$lib/types";
  import { t } from "$lib/i18n/index.svelte";

  let { progress }: { progress: ImportProgress | null } = $props();

  const phaseKeys: Record<string, Parameters<typeof t>[0]> = {
    scanning: "phase_scanning",
    copying: "phase_copying",
    converting: "phase_converting",
    hashing: "phase_hashing",
    preflight: "phase_preflight",
    uploading: "phase_uploading",
    completing: "phase_completing",
    done: "phase_done",
    error: "phase_error",
  };
</script>

{#if progress}
  <div class="rounded-lg border border-border bg-surface-alt p-3 space-y-2">
    <div class="flex items-center justify-between">
      <span class="text-sm font-medium text-gray-700">
        {phaseKeys[progress.phase] ? t(phaseKeys[progress.phase]) : progress.phase}
      </span>
      {#if progress.total > 0}
        <span class="text-xs text-gray-500">
          {progress.current} / {progress.total}
        </span>
      {/if}
    </div>
    {#if progress.fileName}
      <p class="text-xs text-gray-500 truncate">
        {progress.fileName}
      </p>
    {/if}
    {#if progress.message}
      <p class="text-xs text-gray-600">{progress.message}</p>
    {/if}
  </div>
{/if}

<script lang="ts">
  let { progress, label }: { progress: number; label?: string } = $props();

  let clampedProgress = $derived(Math.min(100, Math.max(0, progress)));
</script>

<div>
  <div class="h-2 rounded-full bg-gray-100 overflow-hidden">
    <div
      class="h-full rounded-full bg-primary transition-all duration-300 ease-out"
      style="width: {clampedProgress}%"
    ></div>
  </div>
  {#if label}
    <p class="text-xs text-gray-500 mt-1 text-center">{label}</p>
  {:else}
    <p class="text-xs text-gray-500 mt-1 text-center">{clampedProgress}%</p>
  {/if}
</div>

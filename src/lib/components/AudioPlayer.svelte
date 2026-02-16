<script lang="ts">
  let { src, duration }: { src: string; duration?: number | null } = $props();

  let audioEl: HTMLAudioElement | undefined = $state();
  let playing = $state(false);
  let currentTime = $state(0);
  let initialDuration = $derived(duration ? duration / 1000 : 0);
  let totalDuration = $state(0);

  $effect(() => {
    if (initialDuration > 0) totalDuration = initialDuration;
  });

  export function seekTo(ms: number) {
    if (audioEl) {
      audioEl.currentTime = ms / 1000;
    }
  }

  function toggle() {
    if (!audioEl) return;
    if (playing) {
      audioEl.pause();
    } else {
      audioEl.play();
    }
  }

  function onTimeUpdate() {
    if (audioEl) currentTime = audioEl.currentTime;
  }

  function onLoadedMetadata() {
    if (audioEl && audioEl.duration && isFinite(audioEl.duration)) {
      totalDuration = audioEl.duration;
    }
  }

  function onSeek(e: Event) {
    const input = e.target as HTMLInputElement;
    if (audioEl) {
      audioEl.currentTime = Number(input.value);
    }
  }

  function formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }
</script>

<div class="flex items-center gap-3 rounded-lg border border-border bg-white p-3">
  <audio
    bind:this={audioEl}
    {src}
    ontimeupdate={onTimeUpdate}
    onloadedmetadata={onLoadedMetadata}
    onplay={() => (playing = true)}
    onpause={() => (playing = false)}
    onended={() => (playing = false)}
    preload="metadata"
  ></audio>

  <button
    type="button"
    class="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white hover:bg-primary-hover transition-colors"
    onclick={toggle}
  >
    {#if playing}
      <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
    {:else}
      <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>
    {/if}
  </button>

  <span class="text-xs text-gray-500 w-12 text-right tabular-nums">
    {formatTime(currentTime)}
  </span>

  <input
    type="range"
    min="0"
    max={totalDuration}
    value={currentTime}
    oninput={onSeek}
    class="flex-1 h-1.5 accent-primary cursor-pointer"
  />

  <span class="text-xs text-gray-500 w-12 tabular-nums">
    {formatTime(totalDuration)}
  </span>
</div>

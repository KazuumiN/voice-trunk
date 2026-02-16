<script lang="ts">
  import type { TranscriptSegment } from "$lib/types/index.js";

  let { segments, onSeek }: { segments: TranscriptSegment[]; onSeek?: (ms: number) => void } = $props();

  const speakerColors: string[] = [
    "text-blue-700",
    "text-emerald-700",
    "text-purple-700",
    "text-orange-700",
    "text-pink-700",
    "text-teal-700",
    "text-indigo-700",
    "text-rose-700",
  ];

  function getSpeakerColor(speaker: string): string {
    const speakers = [...new Set(segments.map((s) => s.speaker))];
    const index = speakers.indexOf(speaker);
    return speakerColors[index % speakerColors.length];
  }

  function formatTime(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${String(sec).padStart(2, "0")}`;
  }
</script>

<div class="space-y-3">
  {#each segments as seg}
    <button
      type="button"
      class="block w-full text-left rounded-lg p-3 hover:bg-surface-alt transition-colors"
      onclick={() => onSeek?.(seg.startMs)}
    >
      <div class="flex items-center gap-2 mb-1">
        <span class="text-xs font-semibold {getSpeakerColor(seg.speaker)}">
          {seg.speaker}
        </span>
        <span class="text-xs text-gray-400">
          {formatTime(seg.startMs)} - {formatTime(seg.endMs)}
        </span>
      </div>
      <p class="text-sm text-gray-800 leading-relaxed">{seg.text}</p>
    </button>
  {/each}
</div>

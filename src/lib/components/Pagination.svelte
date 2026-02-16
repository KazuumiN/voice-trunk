<script lang="ts">
  import * as m from "$lib/paraglide/messages.js";

  let {
    hasMore,
    nextCursor,
    totalCount,
    onPageChange,
  }: {
    hasMore: boolean;
    nextCursor: string | null;
    totalCount: number;
    onPageChange: (cursor: string) => void;
  } = $props();
</script>

<div class="flex items-center justify-between border-t border-border pt-4 mt-4">
  <p class="text-sm text-gray-500">
    {m.total_count({ count: String(totalCount) })}
  </p>
  {#if hasMore && nextCursor}
    <button
      class="btn-secondary text-sm"
      onclick={() => onPageChange(nextCursor!)}
    >
      {m.load_more()}
    </button>
  {/if}
</div>

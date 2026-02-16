<script lang="ts">
  import * as m from "$lib/paraglide/messages.js";
  import type { Claim, ClaimStance } from "$lib/types/index.js";

  let { claims }: { claims: Claim[] } = $props();

  const stanceConfig: Record<ClaimStance, { label: () => string; classes: string }> = {
    AFFIRM: { label: m.stance_affirm, classes: "bg-green-100 text-green-700" },
    NEGATE: { label: m.stance_negate, classes: "bg-red-100 text-red-700" },
    UNCERTAIN: { label: m.stance_uncertain, classes: "bg-gray-100 text-gray-700" },
    REPORTING: { label: m.stance_reporting, classes: "bg-blue-100 text-blue-700" },
  };

  const stanceOrder: ClaimStance[] = ["AFFIRM", "NEGATE", "REPORTING", "UNCERTAIN"];

  let grouped = $derived(
    stanceOrder.map((stance) => ({
      stance,
      config: stanceConfig[stance],
      items: claims.filter((c) => c.stance === stance),
    })).filter((g) => g.items.length > 0),
  );
</script>

<div class="space-y-6">
  {#each grouped as group}
    <div>
      <h4 class="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
        <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {group.config.classes}">
          {group.config.label()}
        </span>
        <span class="text-gray-400 text-xs">{m.count_suffix({ count: String(group.items.length) })}</span>
      </h4>
      <div class="space-y-2">
        {#each group.items as claim}
          <div class="rounded-lg border border-border p-3 bg-white">
            <p class="text-sm font-medium text-gray-900">{claim.normalized}</p>
            <blockquote class="mt-1 text-xs text-gray-500 italic border-l-2 border-gray-200 pl-2">
              &ldquo;{claim.quote}&rdquo;
            </blockquote>
            <p class="mt-1 text-xs text-gray-400">
              {m.speaker_prefix()} {claim.speaker}
            </p>
          </div>
        {/each}
      </div>
    </div>
  {/each}
</div>

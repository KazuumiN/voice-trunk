<script lang="ts">
  import * as m from "$lib/paraglide/messages.js";

  let { status }: { status: string } = $props();

  const colorMap: Record<string, string> = {
    REGISTERED: "bg-gray-100 text-gray-700",
    OPEN: "bg-gray-100 text-gray-700",
    UPLOADING: "bg-blue-100 text-blue-700",
    UPLOADED: "bg-indigo-100 text-indigo-700",
    PROCESSING: "bg-amber-100 text-amber-700 animate-pulse",
    RUNNING: "bg-amber-100 text-amber-700 animate-pulse",
    DONE: "bg-green-100 text-green-700",
    COMPLETED: "bg-green-100 text-green-700",
    CONFIRMED: "bg-green-100 text-green-700",
    PARTIAL: "bg-orange-100 text-orange-700",
    PARTIAL_ERROR: "bg-orange-100 text-orange-700",
    ERROR: "bg-red-100 text-red-700",
    DRAFT: "bg-purple-100 text-purple-700",
    MERGED: "bg-gray-100 text-gray-500",
    DISCARDED: "bg-gray-100 text-gray-400",
  };

  const labelMap: Record<string, () => string> = {
    REGISTERED: m.status_registered,
    OPEN: m.status_open,
    UPLOADING: m.status_uploading,
    UPLOADED: m.status_uploaded,
    PROCESSING: m.status_processing,
    RUNNING: m.status_running,
    DONE: m.status_done,
    COMPLETED: m.status_completed,
    CONFIRMED: m.status_confirmed,
    PARTIAL: m.status_partial,
    PARTIAL_ERROR: m.status_partial_error,
    ERROR: m.status_error,
    DRAFT: m.status_draft,
    MERGED: m.status_merged,
    DISCARDED: m.status_discarded,
    active: m.status_active,
    revoked: m.status_revoked,
  };

  let classes = $derived(colorMap[status] ?? "bg-gray-100 text-gray-700");
  let label = $derived((labelMap[status] ?? (() => status))());
</script>

<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {classes}">
  {label}
</span>

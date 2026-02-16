<script lang="ts">
  let { status }: { status: string } = $props();

  const colorMap: Record<string, string> = {
    OPEN: "bg-blue-100 text-blue-700",
    UPLOADING: "bg-yellow-100 text-yellow-700",
    COMPLETED: "bg-green-100 text-green-700",
    PARTIAL_ERROR: "bg-red-100 text-red-700",
    REGISTERED: "bg-gray-100 text-gray-700",
    UPLOADED: "bg-indigo-100 text-indigo-700",
    PROCESSING: "bg-amber-100 text-amber-700 animate-pulse",
    RUNNING: "bg-amber-100 text-amber-700 animate-pulse",
    DONE: "bg-green-100 text-green-700",
    ERROR: "bg-red-100 text-red-700",
  };

  let classes = $derived(colorMap[status] ?? "bg-gray-100 text-gray-700");
</script>

<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {classes}">
  {status}
</span>

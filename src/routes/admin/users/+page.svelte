<script lang="ts">
  import * as m from "$lib/paraglide/messages.js";
  // Placeholder - user management will be implemented later
</script>

<svelte:head>
  <title>{m.users_page_title()}</title>
</svelte:head>

<div class="container-page py-8">
  <h1 class="text-2xl font-bold text-gray-900 mb-6">{m.users_title()}</h1>

  <div class="rounded-lg border border-border bg-white p-8 text-center">
    <p class="text-gray-500 text-sm">{m.users_placeholder()}</p>
    <p class="text-gray-400 text-xs mt-2">{m.users_placeholder_detail()}</p>
  </div>
</div>

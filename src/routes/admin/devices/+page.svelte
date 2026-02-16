<script lang="ts">
  import * as m from "$lib/paraglide/messages.js";
  import StatusBadge from "$lib/components/StatusBadge.svelte";
  import { getDevices } from "$lib/api/client.js";

  let devices: Array<{ deviceId: string; label: string; identifierFileName: string; status: string }> = $state([]);
  let loading = $state(true);

  $effect(() => {
    getDevices()
      .then((res) => {
        devices = res.devices;
      })
      .catch(() => {})
      .finally(() => {
        loading = false;
      });
  });
</script>

<svelte:head>
  <title>{m.devices_page_title()}</title>
</svelte:head>

<div class="container-page py-8">
  <h1 class="text-2xl font-bold text-gray-900 mb-6">{m.devices_title()}</h1>

  {#if loading}
    <p class="text-sm text-gray-400">{m.loading()}</p>
  {:else if devices.length === 0}
    <p class="text-sm text-gray-400 rounded-lg border border-border bg-white p-6 text-center">{m.no_devices()}</p>
  {:else}
    <div class="overflow-hidden rounded-lg border border-border bg-white">
      <table class="w-full text-sm">
        <thead class="bg-surface-alt text-left text-xs text-gray-500">
          <tr>
            <th class="px-4 py-2 font-medium">{m.device_id()}</th>
            <th class="px-4 py-2 font-medium">{m.label()}</th>
            <th class="px-4 py-2 font-medium">{m.identifier_file()}</th>
            <th class="px-4 py-2 font-medium">{m.status_label()}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          {#each devices as device}
            <tr class="hover:bg-surface-alt/50">
              <td class="px-4 py-2 font-mono text-xs text-gray-600">{device.deviceId}</td>
              <td class="px-4 py-2 font-medium text-gray-900">{device.label}</td>
              <td class="px-4 py-2 text-gray-600">{device.identifierFileName}</td>
              <td class="px-4 py-2"><StatusBadge status={device.status} /></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<script lang="ts">
  import * as m from "$lib/paraglide/messages.js";
  import { getLocale } from "$lib/paraglide/runtime.js";
  import StatusBadge from "$lib/components/StatusBadge.svelte";
  import {
    getServiceTokens,
    createServiceToken,
    revokeServiceToken,
    type ServiceToken,
    type ServiceTokenCreated,
  } from "$lib/api/client.js";

  let tokens: ServiceToken[] = $state([]);
  let loading = $state(true);
  let creating = $state(false);
  let newLabel = $state("");
  let newlyCreated: ServiceTokenCreated | null = $state(null);
  let error = $state("");

  async function loadTokens() {
    loading = true;
    try {
      const res = await getServiceTokens();
      tokens = res.tokens;
    } catch {
      error = m.token_fetch_failed();
    } finally {
      loading = false;
    }
  }

  async function handleCreate() {
    if (!newLabel.trim()) return;
    creating = true;
    error = "";
    try {
      const created = await createServiceToken(newLabel.trim());
      newlyCreated = created;
      newLabel = "";
      await loadTokens();
    } catch (e) {
      error = e instanceof Error ? e.message : m.token_create_failed();
    } finally {
      creating = false;
    }
  }

  async function handleRevoke(id: string, label: string) {
    if (!confirm(m.token_revoke_confirm({ label }))) return;
    try {
      await revokeServiceToken(id);
      await loadTokens();
    } catch (e) {
      error = e instanceof Error ? e.message : m.token_revoke_failed();
    }
  }

  function dismissCreated() {
    newlyCreated = null;
  }

  $effect(() => {
    loadTokens();
  });
</script>

<svelte:head>
  <title>{m.tokens_page_title()}</title>
</svelte:head>

<div class="container-page py-8">
  <h1 class="text-2xl font-bold text-gray-900 mb-6">{m.tokens_title()}</h1>

  <!-- Create form -->
  <div class="rounded-lg border border-border bg-white p-6 mb-6">
    <h2 class="text-sm font-semibold text-gray-700 mb-3">{m.new_token()}</h2>
    <form onsubmit={e => { e.preventDefault(); handleCreate(); }} class="flex gap-3 items-end">
      <div class="flex-1">
        <label for="token-label" class="block text-xs text-gray-500 mb-1">{m.token_label_desc()}</label>
        <input
          id="token-label"
          type="text"
          bind:value={newLabel}
          placeholder={m.token_placeholder()}
          class="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
      </div>
      <button
        type="submit"
        disabled={creating || !newLabel.trim()}
        class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {creating ? m.creating() : m.issue()}
      </button>
    </form>
  </div>

  <!-- Newly created token display -->
  {#if newlyCreated}
    <div class="rounded-lg border-2 border-amber-400 bg-amber-50 p-6 mb-6">
      <div class="flex items-start justify-between mb-3">
        <h2 class="text-sm font-semibold text-amber-800">{m.token_issued()}</h2>
        <button onclick={dismissCreated} class="text-amber-600 hover:text-amber-800 text-xs">{m.close()}</button>
      </div>
      <p class="text-xs text-amber-700 mb-4">
        {m.token_secret_warning()}
      </p>
      <div class="space-y-2">
        <div>
          <span class="text-xs text-amber-600 font-medium">Label</span>
          <div class="font-mono text-sm bg-white rounded px-3 py-1.5 border border-amber-200">{newlyCreated.label}</div>
        </div>
        <div>
          <span class="text-xs text-amber-600 font-medium">Client ID</span>
          <div class="font-mono text-sm bg-white rounded px-3 py-1.5 border border-amber-200 select-all">{newlyCreated.clientId}</div>
        </div>
        <div>
          <span class="text-xs text-amber-600 font-medium">Client Secret</span>
          <div class="font-mono text-sm bg-white rounded px-3 py-1.5 border border-amber-200 select-all break-all">{newlyCreated.clientSecret}</div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Error -->
  {#if error}
    <div class="rounded-lg border border-red-200 bg-red-50 p-4 mb-6">
      <p class="text-sm text-red-700">{error}</p>
    </div>
  {/if}

  <!-- Token list -->
  {#if loading}
    <p class="text-sm text-gray-400">{m.loading()}</p>
  {:else if tokens.length === 0}
    <p class="text-sm text-gray-400 rounded-lg border border-border bg-white p-6 text-center">{m.no_tokens()}</p>
  {:else}
    <div class="overflow-hidden rounded-lg border border-border bg-white">
      <table class="w-full text-sm">
        <thead class="bg-surface-alt text-left text-xs text-gray-500">
          <tr>
            <th class="px-4 py-2 font-medium">{m.label()}</th>
            <th class="px-4 py-2 font-medium">Client ID</th>
            <th class="px-4 py-2 font-medium">{m.created_at()}</th>
            <th class="px-4 py-2 font-medium">{m.status_label()}</th>
            <th class="px-4 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          {#each tokens as token}
            <tr class="hover:bg-surface-alt/50" class:opacity-50={token.revokedAt}>
              <td class="px-4 py-2 font-medium text-gray-900">{token.label}</td>
              <td class="px-4 py-2 font-mono text-xs text-gray-600">{token.clientId}</td>
              <td class="px-4 py-2 text-gray-600">{new Date(token.createdAt).toLocaleDateString(getLocale())}</td>
              <td class="px-4 py-2">
                <StatusBadge status={token.revokedAt ? "revoked" : "active"} />
              </td>
              <td class="px-4 py-2 text-right">
                {#if !token.revokedAt}
                  <button
                    onclick={() => handleRevoke(token.id, token.label)}
                    class="text-xs text-red-600 hover:text-red-800 font-medium"
                  >
                    {m.revoke()}
                  </button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

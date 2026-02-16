<script lang="ts">
  import "../app.css";
  import { page } from "$app/stores";
  import { onMount, onDestroy } from "svelte";
  import { appStore } from "$lib/stores.svelte";
  import { t } from "$lib/i18n/index.svelte";

  let { children } = $props();

  const navItems = [
    { href: "/status", labelKey: "nav_status" as const, icon: "home" },
    { href: "/upload", labelKey: "nav_upload" as const, icon: "cloud-upload" },
    { href: "/batches", labelKey: "nav_batches" as const, icon: "upload" },
    { href: "/settings", labelKey: "nav_settings" as const, icon: "gear" },
  ];

  function isActive(href: string, pathname: string): boolean {
    if (href === "/status") return pathname === "/status" || pathname === "/";
    return pathname.startsWith(href);
  }

  onMount(() => {
    appStore.init();
  });

  onDestroy(() => {
    appStore.cleanup();
  });
</script>

<div class="flex min-h-screen bg-surface">
  <!-- Sidebar -->
  <aside class="w-[220px] shrink-0 border-r border-border bg-white flex flex-col">
    <div class="flex items-center gap-2 px-5 py-5 border-b border-border">
      <svg class="h-6 w-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
        <path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
      </svg>
      <h1 class="text-base font-bold text-gray-900">Recorder</h1>
    </div>
    <nav class="flex-1 px-3 py-4 space-y-1">
      {#each navItems as item}
        {@const active = isActive(item.href, $page.url.pathname)}
        <a
          href={item.href}
          class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors {active ? 'bg-primary/10 text-primary' : 'text-gray-600 hover:bg-surface-alt hover:text-gray-900'}"
        >
          {#if item.icon === "home"}
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"/></svg>
          {:else if item.icon === "cloud-upload"}
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"/></svg>
          {:else if item.icon === "upload"}
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg>
          {:else if item.icon === "gear"}
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"/><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          {/if}
          {t(item.labelKey)}
        </a>
      {/each}
    </nav>
  </aside>

  <!-- Main content -->
  <div class="flex-1 flex flex-col min-w-0">
    <header class="flex items-center justify-between h-14 px-6 border-b border-border bg-white shrink-0">
      <span class="text-sm text-gray-500">VoiceTrunk Desktop</span>
      <div class="flex items-center gap-2 text-sm text-gray-500">
        <span class="inline-block h-2.5 w-2.5 rounded-full {appStore.serverConnected ? 'bg-green-500' : 'bg-red-400'}"></span>
        {appStore.serverConnected ? t("connected") : t("disconnected")}
      </div>
    </header>
    <main class="flex-1 overflow-auto">
      {@render children()}
    </main>
  </div>
</div>

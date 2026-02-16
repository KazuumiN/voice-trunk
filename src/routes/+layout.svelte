<script lang="ts">
  import "../app.css";
  import { page } from "$app/stores";
  import * as m from "$lib/paraglide/messages.js";
  import { getLocale, setLocale } from "$lib/paraglide/runtime.js";

  let { children } = $props();

  const navItems = [
    { href: "/", label: () => m.nav_dashboard(), icon: "home" },
    { href: "/workshops", label: () => m.nav_workshops(), icon: "calendar" },
    { href: "/upload", label: () => m.nav_upload(), icon: "cloud-upload" },
    { href: "/batches", label: () => m.nav_batches(), icon: "upload" },
    { href: "/drafts", label: () => m.nav_drafts(), icon: "file" },
    { href: "/admin/devices", label: () => m.nav_devices(), icon: "device" },
    { href: "/admin/tokens", label: () => m.nav_tokens(), icon: "key" },
    { href: "/admin/users", label: () => m.nav_users(), icon: "users" },
  ];

  function isActive(href: string, pathname: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }
</script>

<div class="flex min-h-screen bg-surface">
  <!-- Sidebar -->
  <aside class="w-[280px] shrink-0 border-r border-border bg-white flex flex-col">
    <div class="flex items-center gap-2 px-6 py-5 border-b border-border">
      <svg class="h-6 w-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
        <path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
      </svg>
      <h1 class="text-lg font-bold text-gray-900">VoiceTrunk</h1>
    </div>
    <nav class="flex-1 flex flex-col px-3 py-4 space-y-1">
      {#each navItems as item}
        {@const active = isActive(item.href, $page.url.pathname)}
        <a
          href={item.href}
          class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors {active ? 'bg-primary/10 text-primary' : 'text-gray-600 hover:bg-surface-alt hover:text-gray-900'}"
        >
          {#if item.icon === "home"}
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"/></svg>
          {:else if item.icon === "calendar"}
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"/></svg>
          {:else if item.icon === "cloud-upload"}
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"/></svg>
          {:else if item.icon === "upload"}
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg>
          {:else if item.icon === "file"}
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>
          {:else if item.icon === "key"}
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"/></svg>
          {:else if item.icon === "device"}
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"/></svg>
          {:else if item.icon === "users"}
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/></svg>
          {/if}
          {item.label()}
        </a>
      {/each}
      <div class="mt-auto px-3 pb-4">
        <button
          onclick={() => setLocale(getLocale() === "ja" ? "en" : "ja")}
          class="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-surface-alt hover:text-gray-900"
        >
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802"/></svg>
          {m.lang_switch()}
        </button>
      </div>
    </nav>
  </aside>

  <!-- Main content -->
  <div class="flex-1 flex flex-col min-w-0">
    <header class="flex items-center h-14 px-6 border-b border-border bg-white shrink-0">
      <span class="text-sm text-gray-500">VoiceTrunk</span>
    </header>
    <main class="flex-1 overflow-auto">
      {@render children()}
    </main>
  </div>
</div>

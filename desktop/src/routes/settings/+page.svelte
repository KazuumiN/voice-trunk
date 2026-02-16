<script lang="ts">
  import { onMount } from "svelte";
  import { getConfig, saveConfig, getAuthCredentials, saveAuthCredentials, checkFfmpeg, detectFfmpegPath } from "$lib/tauri";
  import { t, i18n } from "$lib/i18n/index.svelte";
  import type { Locale } from "$lib/i18n/index.svelte";
  import type { AppConfig } from "$lib/types";

  let serverUrl = $state("");
  let clientId = $state("");
  let clientSecret = $state("");
  let ffmpegPath = $state("");
  let maxStorageGb = $state(50);
  let autoImport = $state(false);
  let autoStart = $state(false);
  let watchIntervalMs = $state(5000);

  let saving = $state(false);
  let saved = $state(false);
  let testingConnection = $state(false);
  let connectionResult = $state<"success" | "error" | null>(null);
  let detectingFfmpeg = $state(false);
  let ffmpegResult = $state<boolean | null>(null);

  onMount(async () => {
    try {
      const config = await getConfig();
      serverUrl = config.serverUrl;
      ffmpegPath = config.ffmpegPath;
      maxStorageGb = config.maxStorageGb;
      autoImport = config.autoImport;
      autoStart = config.autoStart;
      watchIntervalMs = config.watchIntervalMs;
    } catch {
      // defaults
    }

    try {
      const creds = await getAuthCredentials();
      clientId = creds.clientId;
      clientSecret = creds.clientSecret;
    } catch {
      // defaults
    }
  });

  async function handleSave() {
    saving = true;
    saved = false;
    try {
      const config: AppConfig = {
        serverUrl,
        ffmpegPath,
        maxStorageGb,
        autoImport,
        autoStart,
        watchIntervalMs,
      };
      await saveConfig(config);
      await saveAuthCredentials(clientId, clientSecret);
      saved = true;
      setTimeout(() => (saved = false), 3000);
    } catch {
      // error
    } finally {
      saving = false;
    }
  }

  async function testConnection() {
    testingConnection = true;
    connectionResult = null;
    try {
      if (!serverUrl) {
        connectionResult = "error";
        return;
      }
      await saveConfig({
        serverUrl,
        ffmpegPath,
        maxStorageGb,
        autoImport,
        autoStart,
        watchIntervalMs,
      });
      await saveAuthCredentials(clientId, clientSecret);
      connectionResult = "success";
    } catch {
      connectionResult = "error";
    } finally {
      testingConnection = false;
    }
  }

  async function detectFfmpeg() {
    detectingFfmpeg = true;
    ffmpegResult = null;
    try {
      const path = await detectFfmpegPath();
      if (path) {
        ffmpegPath = path;
        ffmpegResult = true;
      } else {
        ffmpegResult = false;
      }
    } catch {
      ffmpegResult = false;
    } finally {
      detectingFfmpeg = false;
    }
  }

  function setLocale(newLocale: Locale) {
    i18n.locale = newLocale;
  }
</script>

<svelte:head>
  <title>{t("settings_title")} - VoiceTrunk</title>
</svelte:head>

<div class="p-6 max-w-2xl mx-auto">
  <h1 class="text-2xl font-bold text-gray-900 mb-6">{t("settings_title")}</h1>

  <div class="space-y-6">
    <!-- Language section -->
    <section class="rounded-lg border border-border bg-white p-5">
      <h2 class="text-base font-semibold text-gray-900 mb-4">{t("language")}</h2>
      <div class="flex gap-2">
        <button
          class="px-4 py-2 rounded-lg text-sm font-medium transition-colors {i18n.locale === 'en' ? 'bg-primary text-white' : 'bg-surface-alt text-gray-700 hover:bg-gray-200'}"
          onclick={() => setLocale("en")}
        >
          {t("lang_en")}
        </button>
        <button
          class="px-4 py-2 rounded-lg text-sm font-medium transition-colors {i18n.locale === 'ja' ? 'bg-primary text-white' : 'bg-surface-alt text-gray-700 hover:bg-gray-200'}"
          onclick={() => setLocale("ja")}
        >
          {t("lang_ja")}
        </button>
      </div>
    </section>

    <!-- Server section -->
    <section class="rounded-lg border border-border bg-white p-5">
      <h2 class="text-base font-semibold text-gray-900 mb-4">{t("server_connection")}</h2>
      <div class="space-y-4">
        <div>
          <label for="server-url" class="block text-sm font-medium text-gray-700 mb-1">{t("server_url")}</label>
          <input
            id="server-url"
            type="text"
            class="block w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:ring-1 focus:ring-primary"
            placeholder="https://recorder.example.com"
            bind:value={serverUrl}
          />
        </div>
        <div>
          <label for="client-id" class="block text-sm font-medium text-gray-700 mb-1">Client ID</label>
          <input
            id="client-id"
            type="text"
            class="block w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:ring-1 focus:ring-primary"
            bind:value={clientId}
          />
        </div>
        <div>
          <label for="client-secret" class="block text-sm font-medium text-gray-700 mb-1">Client Secret</label>
          <input
            id="client-secret"
            type="password"
            class="block w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:ring-1 focus:ring-primary"
            bind:value={clientSecret}
          />
        </div>
        <div class="flex items-center gap-3">
          <button class="btn-secondary text-sm" onclick={testConnection} disabled={testingConnection}>
            {testingConnection ? t("testing") : t("test_connection")}
          </button>
          {#if connectionResult === "success"}
            <span class="text-sm text-green-600 font-medium">{t("connection_success")}</span>
          {:else if connectionResult === "error"}
            <span class="text-sm text-red-600 font-medium">{t("connection_failed")}</span>
          {/if}
        </div>
      </div>
    </section>

    <!-- ffmpeg section -->
    <section class="rounded-lg border border-border bg-white p-5">
      <h2 class="text-base font-semibold text-gray-900 mb-4">ffmpeg</h2>
      <div class="space-y-4">
        <div>
          <label for="ffmpeg-path" class="block text-sm font-medium text-gray-700 mb-1">{t("ffmpeg_path")}</label>
          <div class="flex gap-2">
            <input
              id="ffmpeg-path"
              type="text"
              class="block flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="ffmpeg"
              bind:value={ffmpegPath}
            />
            <button class="btn-secondary text-sm whitespace-nowrap" onclick={detectFfmpeg} disabled={detectingFfmpeg}>
              {detectingFfmpeg ? t("detecting") : t("auto_detect")}
            </button>
          </div>
          {#if ffmpegResult === true}
            <p class="text-xs text-green-600 mt-1">{t("ffmpeg_found")}</p>
          {:else if ffmpegResult === false}
            <p class="text-xs text-red-600 mt-1">{t("ffmpeg_not_found_short")}</p>
          {/if}
        </div>
      </div>
    </section>

    <!-- Storage & behavior section -->
    <section class="rounded-lg border border-border bg-white p-5">
      <h2 class="text-base font-semibold text-gray-900 mb-4">{t("behavior")}</h2>
      <div class="space-y-4">
        <div>
          <label for="max-storage" class="block text-sm font-medium text-gray-700 mb-1">{t("storage_limit")}</label>
          <input
            id="max-storage"
            type="number"
            min="1"
            max="1000"
            class="block w-32 rounded-lg border border-border bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:ring-1 focus:ring-primary"
            bind:value={maxStorageGb}
          />
        </div>
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-700">{t("auto_import")}</p>
            <p class="text-xs text-gray-500">{t("auto_import_desc")}</p>
          </div>
          <button
            class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors {autoImport ? 'bg-primary' : 'bg-gray-200'}"
            role="switch"
            aria-checked={autoImport}
            aria-label={t("auto_import")}
            onclick={() => (autoImport = !autoImport)}
          >
            <span class="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform {autoImport ? 'translate-x-5' : 'translate-x-0'}"></span>
          </button>
        </div>
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-700">{t("auto_start")}</p>
            <p class="text-xs text-gray-500">{t("auto_start_desc")}</p>
          </div>
          <button
            class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors {autoStart ? 'bg-primary' : 'bg-gray-200'}"
            role="switch"
            aria-checked={autoStart}
            aria-label={t("auto_start")}
            onclick={() => (autoStart = !autoStart)}
          >
            <span class="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform {autoStart ? 'translate-x-5' : 'translate-x-0'}"></span>
          </button>
        </div>
      </div>
    </section>

    <!-- Save button -->
    <div class="flex items-center gap-3">
      <button class="btn-primary" onclick={handleSave} disabled={saving}>
        {saving ? t("saving") : t("save")}
      </button>
      {#if saved}
        <span class="text-sm text-green-600 font-medium">{t("saved")}</span>
      {/if}
    </div>
  </div>
</div>

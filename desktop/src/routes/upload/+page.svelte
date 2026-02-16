<script lang="ts">
  import { open } from "@tauri-apps/plugin-dialog";
  import { getCurrentWebview } from "@tauri-apps/api/webview";
  import { onMount, onDestroy } from "svelte";
  import ProgressBar from "$lib/components/ProgressBar.svelte";
  import StatusBadge from "$lib/components/StatusBadge.svelte";
  import { hashFile, uploadFiles, scanFiles } from "$lib/tauri";
  import { onHashProgress, onUploadProgress } from "$lib/tauri";
  import { t } from "$lib/i18n/index.svelte";
  import type { ManualUploadFile, HashProgress, UploadProgress } from "$lib/types";

  const AUDIO_EXTENSIONS = ["wma", "mp3", "wav", "m4a", "ogg", "flac", "mp4"];

  type FileEntry = {
    path: string;
    name: string;
    sizeBytes: number;
    status: "pending" | "hashing" | "uploading" | "done" | "error";
    hashProgress: number;
    uploadProgress: number;
    sha256: string | null;
    error: string | null;
  };

  let files = $state<FileEntry[]>([]);
  let uploading = $state(false);
  let batchId = $state<string | null>(null);
  let dragging = $state(false);

  let hasFiles = $derived(files.length > 0);
  let hasPending = $derived(files.some((f) => f.status === "pending"));
  let canStart = $derived(hasPending && !uploading);
  let allDone = $derived(files.length > 0 && files.every((f) => f.status === "done" || f.status === "error"));

  let unlistenDragDrop: (() => void) | null = null;

  onMount(async () => {
    unlistenDragDrop = await getCurrentWebview().onDragDropEvent((event) => {
      if (uploading) return;

      if (event.payload.type === "enter" || event.payload.type === "over") {
        dragging = true;
      } else if (event.payload.type === "leave") {
        dragging = false;
      } else if (event.payload.type === "drop") {
        dragging = false;
        addPaths(event.payload.paths);
      }
    });
  });

  onDestroy(() => {
    unlistenDragDrop?.();
  });

  function addPaths(paths: string[]) {
    for (const path of paths) {
      const name = path.split("/").pop() ?? path;
      const ext = name.split(".").pop()?.toLowerCase() ?? "";
      if (!AUDIO_EXTENSIONS.includes(ext)) continue;
      if (files.find((f) => f.path === path)) continue;
      files.push({
        path,
        name,
        sizeBytes: 0,
        status: "pending",
        hashProgress: 0,
        uploadProgress: 0,
        sha256: null,
        error: null,
      });
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  async function selectFiles() {
    const selected = await open({
      multiple: true,
      filters: [
        { name: t("audio_files"), extensions: AUDIO_EXTENSIONS },
      ],
    });
    if (!selected) return;

    const paths = Array.isArray(selected) ? selected : [selected];
    addPaths(paths);
  }

  function removeFile(index: number) {
    files.splice(index, 1);
  }

  function clearFiles() {
    files = [];
    batchId = null;
  }

  async function startUpload() {
    uploading = true;

    const unlistenHash = await onHashProgress((progress: HashProgress) => {
      const entry = files.find((f) => f.name === progress.fileName);
      if (entry && progress.totalBytes > 0) {
        entry.hashProgress = Math.round((progress.bytesHashed / progress.totalBytes) * 100);
        entry.sizeBytes = progress.totalBytes;
      }
    });

    const unlistenUpload = await onUploadProgress((progress: UploadProgress) => {
      const entry = files.find((f) => f.sha256 && f.status === "uploading");
      if (entry && progress.totalBytes > 0) {
        entry.uploadProgress = Math.round((progress.bytesUploaded / progress.totalBytes) * 100);
      }
    });

    try {
      for (const entry of files) {
        if (entry.status !== "pending") continue;
        entry.status = "hashing";
        entry.hashProgress = 0;
        try {
          entry.sha256 = await hashFile(entry.path);
          entry.hashProgress = 100;
        } catch (err) {
          entry.status = "error";
          entry.error = err instanceof Error ? err.message : t("hash_failed");
        }
      }

      const toUpload: ManualUploadFile[] = files
        .filter((f) => f.status === "hashing" && f.sha256)
        .map((f) => ({ path: f.path, name: f.name, sizeBytes: f.sizeBytes }));

      if (toUpload.length > 0) {
        for (const entry of files) {
          if (entry.status === "hashing") entry.status = "uploading";
        }

        batchId = await uploadFiles(toUpload);

        for (const entry of files) {
          if (entry.status === "uploading") {
            entry.status = "done";
            entry.uploadProgress = 100;
          }
        }
      }
    } catch (err) {
      for (const entry of files) {
        if (entry.status === "hashing" || entry.status === "uploading") {
          entry.status = "error";
          entry.error = err instanceof Error ? err.message : t("upload_failed");
        }
      }
    } finally {
      unlistenHash();
      unlistenUpload();
      uploading = false;
    }
  }
</script>

<svelte:head>
  <title>{t("upload_title")} - VoiceTrunk</title>
</svelte:head>

<div class="p-6 max-w-4xl mx-auto">
  <h1 class="text-2xl font-bold text-gray-900 mb-6">{t("upload_title")}</h1>

  <!-- Drop zone / file picker -->
  <div
    class="relative mb-6 rounded-lg border-2 border-dashed p-8 text-center transition-colors
      {dragging ? 'border-primary bg-primary/5' : 'border-border bg-white'}"
  >
    {#if dragging}
      <div class="flex flex-col items-center justify-center py-4">
        <svg class="mx-auto h-12 w-12 text-primary mb-3 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
          <path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/>
        </svg>
        <p class="text-sm font-medium text-primary">{t("drop_here")}</p>
      </div>
    {:else}
      <svg class="mx-auto h-12 w-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
        <path d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"/>
      </svg>
      <p class="text-sm text-gray-600 mb-2">{t("upload_description")}</p>
      <button class="btn-secondary text-sm" onclick={selectFiles} disabled={uploading}>
        {t("select_files")}
      </button>
      <p class="text-xs text-gray-400 mt-4">{t("supported_formats")}</p>
    {/if}
  </div>

  <!-- File list -->
  {#if hasFiles}
    <div class="mb-6 rounded-lg border border-border bg-white overflow-hidden">
      <div class="px-4 py-3 border-b border-border bg-gray-50 flex items-center justify-between">
        <span class="text-sm font-medium text-gray-700">{files.length}{t("files_selected")}</span>
        <div class="flex gap-2">
          <button class="btn-secondary text-sm" onclick={clearFiles} disabled={uploading}>{t("clear")}</button>
          <button class="btn-primary text-sm" onclick={startUpload} disabled={!canStart}>
            {uploading ? t("processing") : t("start_upload")}
          </button>
        </div>
      </div>
      <div class="divide-y divide-border">
        {#each files as entry, i}
          <div class="flex items-center gap-4 px-4 py-3">
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-900 truncate">{entry.name}</p>
              <p class="text-xs text-gray-500">
                {entry.sizeBytes > 0 ? formatSize(entry.sizeBytes) : ""}
                {#if entry.sha256}
                  <span class="ml-2 font-mono">{entry.sha256.slice(0, 12)}...</span>
                {/if}
              </p>
            </div>
            <div class="w-36 shrink-0">
              {#if entry.status === "hashing"}
                <ProgressBar progress={entry.hashProgress} label={t("hashing")} />
              {:else if entry.status === "uploading"}
                <ProgressBar progress={entry.uploadProgress} label="{entry.uploadProgress}%" />
              {:else if entry.status === "done"}
                <span class="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path d="M5 13l4 4L19 7"/></svg>
                  {t("done")}
                </span>
              {:else if entry.status === "error"}
                <span class="text-xs text-red-600 font-medium" title={entry.error ?? ""}>{t("error")}</span>
              {:else}
                <span class="text-xs text-gray-400">{t("pending")}</span>
              {/if}
            </div>
            {#if !uploading && entry.status !== "done"}
              <button
                class="text-gray-400 hover:text-red-500 transition-colors"
                onclick={() => removeFile(i)}
                aria-label={t("remove")}
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            {:else}
              <div class="w-4"></div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Post-upload -->
  {#if allDone && batchId}
    <div class="rounded-lg border border-green-200 bg-green-50 p-4">
      <p class="text-sm text-green-800 mb-2">{t("upload_complete")}</p>
      <a href="/batches" class="text-sm font-medium text-primary hover:underline">
        {t("view_batches")} &rarr;
      </a>
    </div>
  {/if}
</div>

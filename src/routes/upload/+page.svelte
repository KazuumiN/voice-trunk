<script lang="ts">
  import { sha256File } from "$lib/utils/hash.js";
  import { preflightBatch, presignUpload, presignPart, completeMultipart } from "$lib/api/client.js";
  import { WEB_UPLOAD, MULTIPART } from "$lib/constants.js";
  import type { PresignResponse } from "$lib/api/client.js";
  import * as m from "$lib/paraglide/messages.js";

  let { data } = $props();

  type FileEntry = {
    file: File;
    status: "pending" | "hashing" | "preflight" | "uploading" | "done" | "skipped" | "error";
    progress: number;
    sha256: string | null;
    recordingId: string | null;
    batchId: string | null;
    error: string | null;
  };

  let files = $state<FileEntry[]>([]);
  let selectedDeviceId = $state<string>("");
  let uploading = $state(false);
  let batchId = $state<string | null>(null);
  let dragOver = $state(false);

  let hasFiles = $derived(files.length > 0);
  let allDone = $derived(files.length > 0 && files.every((f) => f.status === "done" || f.status === "skipped" || f.status === "error"));
  let hasPending = $derived(files.some((f) => f.status === "pending"));
  let canStart = $derived(hasPending && !uploading);

  function validateFile(file: File): string | null {
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    if (!(WEB_UPLOAD.ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
      return m.unsupported_format({ ext });
    }
    if (file.size > WEB_UPLOAD.MAX_FILE_SIZE_BYTES) {
      return m.file_too_large({ size: (WEB_UPLOAD.MAX_FILE_SIZE_BYTES / 1024 / 1024 / 1024).toFixed(0) });
    }
    return null;
  }

  function addFiles(newFiles: FileList | File[]) {
    const remaining = WEB_UPLOAD.MAX_FILES_PER_SESSION - files.length;
    const toAdd = Array.from(newFiles).slice(0, remaining);
    for (const file of toAdd) {
      const validationError = validateFile(file);
      files.push({
        file,
        status: validationError ? "error" : "pending",
        progress: 0,
        sha256: null,
        recordingId: null,
        batchId: null,
        error: validationError,
      });
    }
  }

  function removeFile(index: number) {
    files.splice(index, 1);
  }

  function clearFiles() {
    files = [];
    batchId = null;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragOver = true;
  }

  function handleDragLeave() {
    dragOver = false;
  }

  function handleFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files) addFiles(input.files);
    input.value = "";
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  async function uploadFileWithProgress(url: string, file: File | Blob, entry: FileEntry): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      xhr.setRequestHeader("Content-Type", file instanceof File ? (file.type || "application/octet-stream") : "application/octet-stream");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          entry.progress = Math.round((e.loaded / e.total) * 100);
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error("Network error"));
      xhr.send(file);
    });
  }

  async function uploadMultipart(entry: FileEntry, recordingId: string): Promise<void> {
    const file = entry.file;
    const partSize = MULTIPART.PART_SIZE_BYTES;
    const totalParts = Math.ceil(file.size / partSize);

    // Request multipart upload initiation
    const presignRes = await presignUpload(recordingId, { multipart: true });
    if (presignRes.method !== "MULTIPART" || !presignRes.uploadId) {
      throw new Error("Server did not return multipart upload");
    }
    const uploadId = presignRes.uploadId;

    const parts: Array<{ partNumber: number; etag: string }> = [];
    let uploadedBytes = 0;

    for (let i = 0; i < totalParts; i++) {
      const start = i * partSize;
      const end = Math.min(start + partSize, file.size);
      const blob = file.slice(start, end);
      const partNumber = i + 1;

      const partRes = await presignPart(recordingId, uploadId, partNumber);

      // Upload part with XMLHttpRequest for progress
      const etag = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", partRes.url);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const currentBytes = uploadedBytes + e.loaded;
            entry.progress = Math.round((currentBytes / file.size) * 100);
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const etagHeader = xhr.getResponseHeader("ETag");
            if (!etagHeader) {
              reject(new Error("No ETag in response"));
              return;
            }
            resolve(etagHeader);
          } else {
            reject(new Error(`Part upload failed: ${xhr.status}`));
          }
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(blob);
      });

      uploadedBytes += (end - start);
      parts.push({ partNumber, etag });
    }

    await completeMultipart(recordingId, uploadId, parts);
  }

  async function startUpload() {
    uploading = true;
    const pendingFiles = files.filter((f) => f.status === "pending");
    if (pendingFiles.length === 0) {
      uploading = false;
      return;
    }

    // Step 1: Hash each file
    for (const entry of pendingFiles) {
      entry.status = "hashing";
      entry.progress = 0;
      try {
        entry.sha256 = await sha256File(entry.file, (loaded, total) => {
          entry.progress = Math.round((loaded / total) * 100);
        });
      } catch (err) {
        entry.status = "error";
        entry.error = m.hash_failed();
      }
    }

    const hashedFiles = pendingFiles.filter((f) => f.status === "hashing");
    if (hashedFiles.length === 0) {
      uploading = false;
      return;
    }

    // Step 2: Preflight batch
    for (const entry of hashedFiles) {
      entry.status = "preflight";
    }

    try {
      const preflightRes = await preflightBatch(
        hashedFiles.map((f) => ({
          deviceId: selectedDeviceId || null,
          originalFileName: f.file.name,
          sizeBytes: f.file.size,
          sha256: f.sha256!,
        })),
      );

      batchId = preflightRes.batchId;

      for (const result of preflightRes.results) {
        const entry = hashedFiles.find((f) => f.sha256 === result.sha256);
        if (!entry) continue;

        entry.recordingId = result.recordingId;
        entry.batchId = preflightRes.batchId;

        if (result.status === "ALREADY_EXISTS") {
          entry.status = "skipped";
          entry.progress = 100;
          continue;
        }

        // Step 3: Upload
        entry.status = "uploading";
        entry.progress = 0;

        try {
          if (entry.file.size >= MULTIPART.THRESHOLD_BYTES) {
            await uploadMultipart(entry, result.recordingId);
          } else {
            const presignRes = await presignUpload(result.recordingId);
            if (!presignRes.url) throw new Error("No presigned URL returned");
            await uploadFileWithProgress(presignRes.url, entry.file, entry);
          }
          entry.status = "done";
          entry.progress = 100;
        } catch (err) {
          entry.status = "error";
          entry.error = err instanceof Error ? err.message : m.upload_failed();
        }
      }
    } catch (err) {
      for (const entry of hashedFiles) {
        if (entry.status === "preflight") {
          entry.status = "error";
          entry.error = err instanceof Error ? err.message : m.preflight_failed();
        }
      }
    }

    uploading = false;
  }
</script>

<svelte:head>
  <title>{m.upload_page_title()}</title>
</svelte:head>

<div class="container-page py-8">
  <h1 class="text-2xl font-bold text-gray-900 mb-6">{m.upload_title()}</h1>

  <!-- Device selector -->
  <div class="mb-6">
    <label for="device-select" class="block text-sm font-medium text-gray-700 mb-1">{m.device_optional()}</label>
    <select
      id="device-select"
      class="block w-64 rounded-lg border border-border bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:ring-1 focus:ring-primary"
      bind:value={selectedDeviceId}
      disabled={uploading}
    >
      <option value="">{m.none()}</option>
      {#each data.devices as device}
        <option value={device.deviceId}>{device.label}</option>
      {/each}
    </select>
  </div>

  <!-- Drop zone -->
  <div
    class="relative mb-6 rounded-lg border-2 border-dashed p-8 text-center transition-colors {dragOver ? 'border-primary bg-primary/5' : 'border-border bg-white'}"
    ondrop={handleDrop}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    role="region"
    aria-label={m.drop_area_label()}
  >
    <svg class="mx-auto h-12 w-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
      <path d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"/>
    </svg>
    <p class="text-sm text-gray-600 mb-2">{m.drop_zone_text()}</p>
    <p class="text-xs text-gray-400 mb-4">
      {m.supported_formats()} {WEB_UPLOAD.ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(", ")}
      / {m.max_file_size({ size: (WEB_UPLOAD.MAX_FILE_SIZE_BYTES / 1024 / 1024 / 1024).toFixed(0) })}
      / {m.max_file_count({ count: String(WEB_UPLOAD.MAX_FILES_PER_SESSION) })}
    </p>
    <label class="btn-secondary text-sm cursor-pointer inline-block">
      {m.select_files()}
      <input
        type="file"
        accept={WEB_UPLOAD.ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",")}
        multiple
        class="hidden"
        onchange={handleFileInput}
        disabled={uploading}
      />
    </label>
  </div>

  <!-- File list -->
  {#if hasFiles}
    <div class="mb-6 rounded-lg border border-border bg-white overflow-hidden">
      <div class="px-4 py-3 border-b border-border bg-gray-50 flex items-center justify-between">
        <span class="text-sm font-medium text-gray-700">{m.file_count_label({ count: String(files.length) })}</span>
        <div class="flex gap-2">
          <button class="btn-secondary text-sm" onclick={clearFiles} disabled={uploading}>{m.clear()}</button>
          <button class="btn-primary text-sm" onclick={startUpload} disabled={!canStart}>
            {uploading ? m.uploading() : m.start_upload()}
          </button>
        </div>
      </div>
      <div class="divide-y divide-border">
        {#each files as entry, i}
          <div class="flex items-center gap-4 px-4 py-3">
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-900 truncate">{entry.file.name}</p>
              <p class="text-xs text-gray-500">{formatSize(entry.file.size)}</p>
            </div>
            <div class="w-32 shrink-0">
              {#if entry.status === "uploading" || entry.status === "hashing"}
                <div class="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    class="h-full rounded-full bg-primary transition-all"
                    style="width: {entry.progress}%"
                  ></div>
                </div>
                <p class="text-xs text-gray-500 mt-0.5 text-center">
                  {entry.status === "hashing" ? m.hashing() : `${entry.progress}%`}
                </p>
              {:else if entry.status === "done"}
                <span class="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path d="M5 13l4 4L19 7"/></svg>
                  {m.done()}
                </span>
              {:else if entry.status === "skipped"}
                <span class="text-xs text-gray-500 font-medium">{m.skipped_duplicate()}</span>
              {:else if entry.status === "error"}
                <span class="text-xs text-red-600 font-medium" title={entry.error ?? ""}>{m.error_label()}</span>
              {:else if entry.status === "preflight"}
                <span class="text-xs text-gray-500">{m.confirming()}</span>
              {:else}
                <span class="text-xs text-gray-400">{m.waiting()}</span>
              {/if}
            </div>
            {#if !uploading && entry.status !== "done"}
              <button
                class="text-gray-400 hover:text-red-500 transition-colors"
                onclick={() => removeFile(i)}
                aria-label={m.delete_label()}
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

  <!-- Post-upload link -->
  {#if allDone && batchId}
    <div class="rounded-lg border border-green-200 bg-green-50 p-4">
      <p class="text-sm text-green-800 mb-2">{m.upload_complete()}</p>
      <a href="/batches/{batchId}" class="text-sm font-medium text-primary hover:underline">
        {m.check_batch_detail()} &rarr;
      </a>
    </div>
  {/if}

  {#if data.error}
    <div class="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-700">
      {data.error}
    </div>
  {/if}
</div>

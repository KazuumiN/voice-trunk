import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  MountInfo,
  RecorderIdentifier,
  FileInfo,
  ManualUploadFile,
  AppConfig,
  BatchState,
  HashProgress,
  UploadProgress,
  ImportProgress,
} from "./types";

// ===== Commands =====

export async function scanVolumes(): Promise<MountInfo[]> {
  return invoke<MountInfo[]>("scan_volumes");
}

export async function identifyDevice(mountPath: string): Promise<RecorderIdentifier | null> {
  return invoke<RecorderIdentifier | null>("identify_device", { mountPath });
}

export async function scanFiles(dirPath: string): Promise<FileInfo[]> {
  return invoke<FileInfo[]>("scan_files", { dirPath });
}

export async function hashFile(path: string): Promise<string> {
  return invoke<string>("hash_file", { path });
}

export async function startImport(mountPath: string, deviceId: string): Promise<string> {
  return invoke<string>("start_import", { mountPath, deviceId });
}

export async function cancelImport(batchId: string): Promise<void> {
  return invoke<void>("cancel_import", { batchId });
}

export async function uploadFiles(files: ManualUploadFile[]): Promise<string> {
  return invoke<string>("upload_files", { files });
}

export async function getConfig(): Promise<AppConfig> {
  return invoke<AppConfig>("get_config");
}

export async function saveConfig(config: AppConfig): Promise<void> {
  return invoke<void>("save_config", { config });
}

export async function getAuthCredentials(): Promise<{ clientId: string; clientSecret: string }> {
  return invoke<{ clientId: string; clientSecret: string }>("get_auth_credentials");
}

export async function saveAuthCredentials(clientId: string, clientSecret: string): Promise<void> {
  return invoke<void>("save_auth_credentials", { clientId, clientSecret });
}

export async function checkFfmpeg(ffmpegPath?: string): Promise<boolean> {
  return invoke<boolean>("check_ffmpeg", { ffmpegPath: ffmpegPath ?? null });
}

export async function detectFfmpegPath(): Promise<string | null> {
  return invoke<string | null>("detect_ffmpeg_path");
}

export async function getBatches(): Promise<Record<string, BatchState>> {
  return invoke<Record<string, BatchState>>("get_batches");
}

export async function cleanCompletedBatches(): Promise<number> {
  return invoke<number>("clean_completed_batches");
}

// ===== Event Listeners =====

export function onMountDetected(cb: (mount: MountInfo) => void): Promise<UnlistenFn> {
  return listen<MountInfo>("mount-detected", (event) => cb(event.payload));
}

export function onMountRemoved(cb: (payload: { path: string; name: string }) => void): Promise<UnlistenFn> {
  return listen<{ path: string; name: string }>("mount-removed", (event) => cb(event.payload));
}

export function onImportProgress(cb: (progress: ImportProgress) => void): Promise<UnlistenFn> {
  return listen<ImportProgress>("import-progress", (event) => cb(event.payload));
}

export function onHashProgress(cb: (progress: HashProgress) => void): Promise<UnlistenFn> {
  return listen<HashProgress>("hash-progress", (event) => cb(event.payload));
}

export function onUploadProgress(cb: (progress: UploadProgress) => void): Promise<UnlistenFn> {
  return listen<UploadProgress>("upload-progress", (event) => cb(event.payload));
}

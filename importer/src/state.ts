import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getBasePath } from "./config.js";

export interface FileStatus {
  recordingId: string;
  uploaded: boolean;
  error?: string;
  uploadId?: string;
  rawR2Key?: string;
  completedParts?: number[];
  multipartUploadId?: string;
}

export interface BatchState {
  status: "OPEN" | "UPLOADING" | "COMPLETED" | "PARTIAL_ERROR";
  deviceId: string;
  files: Record<string, FileStatus>; // keyed by sha256
}

export interface State {
  batches: Record<string, BatchState>; // keyed by batchId
}

function getStatePath(): string {
  return join(getBasePath(), "state.json");
}

export async function readState(): Promise<State> {
  const statePath = getStatePath();
  if (!existsSync(statePath)) {
    return { batches: {} };
  }
  const raw = await readFile(statePath, "utf-8");
  return JSON.parse(raw) as State;
}

export async function writeState(state: State): Promise<void> {
  const basePath = getBasePath();
  await mkdir(basePath, { recursive: true });
  const statePath = getStatePath();
  await writeFile(statePath, JSON.stringify(state, null, 2), "utf-8");
}

export async function updateFileStatus(
  batchId: string,
  sha256: string,
  update: Partial<FileStatus>,
): Promise<void> {
  const state = await readState();
  const batch = state.batches[batchId];
  if (!batch) return;
  const existing = batch.files[sha256];
  if (!existing) return;
  batch.files[sha256] = { ...existing, ...update };
  await writeState(state);
}

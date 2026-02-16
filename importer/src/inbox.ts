import { existsSync } from "node:fs";
import { mkdir, readdir, stat, rm } from "node:fs/promises";
import { join } from "node:path";
import { getBasePath, readConfig } from "./config.js";
import { readState, type State } from "./state.js";

function getInboxPath(): string {
  return join(getBasePath(), "inbox");
}

export async function ensureInboxDir(
  batchId: string,
  deviceId: string,
): Promise<string> {
  const dirPath = join(getInboxPath(), batchId, deviceId);
  await mkdir(dirPath, { recursive: true });
  return dirPath;
}

export async function getInboxSize(): Promise<number> {
  const inboxPath = getInboxPath();
  if (!existsSync(inboxPath)) return 0;
  return await dirSize(inboxPath);
}

async function dirSize(dirPath: string): Promise<number> {
  let total = 0;
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += await dirSize(fullPath);
    } else if (entry.isFile()) {
      try {
        const info = await stat(fullPath);
        total += info.size;
      } catch {
        // Skip files we can't stat
      }
    }
  }
  return total;
}

export async function checkStorageLimit(additionalBytes: number): Promise<boolean> {
  const config = await readConfig();
  const maxBytes = config.maxStorageGB * 1024 * 1024 * 1024;
  const currentSize = await getInboxSize();
  return currentSize + additionalBytes <= maxBytes;
}

export async function cleanCompletedBatches(): Promise<number> {
  const state = await readState();
  const inboxPath = getInboxPath();
  let deletedCount = 0;

  for (const [batchId, batch] of Object.entries(state.batches)) {
    const allUploaded = Object.values(batch.files).every((f) => f.uploaded);
    if (!allUploaded) continue;

    const batchDir = join(inboxPath, batchId);
    if (existsSync(batchDir)) {
      const count = await countFiles(batchDir);
      await rm(batchDir, { recursive: true, force: true });
      deletedCount += count;
    }
  }

  return deletedCount;
}

async function countFiles(dirPath: string): Promise<number> {
  let count = 0;
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      count += await countFiles(join(dirPath, entry.name));
    } else {
      count++;
    }
  }
  return count;
}

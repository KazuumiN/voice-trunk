import { readdir, stat } from "node:fs/promises";
import { join, extname } from "node:path";

export interface FileInfo {
  path: string;
  name: string;
  size: number;
  modified: Date;
}

const AUDIO_EXTENSIONS = new Set([
  ".wav",
  ".mp3",
  ".wma",
  ".m4a",
  ".flac",
  ".ogg",
]);

export async function scanForRecordings(mountPath: string): Promise<FileInfo[]> {
  const results: FileInfo[] = [];
  await scanDir(mountPath, results);
  // Sort by modified date, newest first
  results.sort((a, b) => b.modified.getTime() - a.modified.getTime());
  return results;
}

async function scanDir(dirPath: string, results: FileInfo[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return; // Skip unreadable directories
  }

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      // Skip hidden directories
      if (!entry.name.startsWith(".")) {
        await scanDir(fullPath, results);
      }
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (AUDIO_EXTENSIONS.has(ext)) {
        try {
          const info = await stat(fullPath);
          results.push({
            path: fullPath,
            name: entry.name,
            size: info.size,
            modified: info.mtime,
          });
        } catch {
          // Skip files we can't stat
        }
      }
    }
  }
}

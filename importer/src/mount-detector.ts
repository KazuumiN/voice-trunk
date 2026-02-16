import { readdir } from "node:fs/promises";

const SYSTEM_VOLUMES = new Set([
  ".vol",
  "Macintosh HD",
  "Macintosh HD - Data",
  "Recovery",
  "Preboot",
  "VM",
  "Update",
]);

export async function* pollMounts(
  interval: number = 3000,
): AsyncGenerator<string> {
  const knownMounts = new Set<string>();

  // Initialize with current mounts
  try {
    const initial = await readdir("/Volumes");
    for (const name of initial) {
      knownMounts.add(name);
    }
  } catch {
    // /Volumes may not exist on non-macOS; ignore
  }

  while (true) {
    await new Promise((resolve) => setTimeout(resolve, interval));

    try {
      const current = await readdir("/Volumes");
      for (const name of current) {
        if (!knownMounts.has(name) && !SYSTEM_VOLUMES.has(name)) {
          knownMounts.add(name);
          yield `/Volumes/${name}`;
        }
      }
      // Remove volumes that disappeared
      for (const name of knownMounts) {
        if (!current.includes(name)) {
          knownMounts.delete(name);
        }
      }
    } catch {
      // Ignore transient errors reading /Volumes
    }
  }
}

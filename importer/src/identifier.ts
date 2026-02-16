import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface RecorderIdentifier {
  deviceId: string;
  label: string;
  orgIdHint?: string;
  notes?: string;
}

export async function readIdentifier(
  mountPath: string,
): Promise<RecorderIdentifier | null> {
  const filePath = join(mountPath, "RECORDER_ID.json");
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed.deviceId || !parsed.label) {
      console.error(`Invalid RECORDER_ID.json at ${filePath}: missing deviceId or label`);
      return null;
    }
    return {
      deviceId: parsed.deviceId,
      label: parsed.label,
      orgIdHint: parsed.orgIdHint,
      notes: parsed.notes,
    };
  } catch (err) {
    console.error(`Failed to read RECORDER_ID.json at ${filePath}:`, err);
    return null;
  }
}

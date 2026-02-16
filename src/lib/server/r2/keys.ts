import { R2_KEYS } from "../../constants.js";

/**
 * R2 key construction helpers that delegate to the canonical patterns in constants.ts,
 * plus a parser for extracting orgId/recordingId from raw keys.
 */

export function rawKey(
  orgId: string,
  recordingId: string,
  fileName: string,
): string {
  return R2_KEYS.raw(orgId, recordingId, fileName);
}

export function chunkKey(
  orgId: string,
  recordingId: string,
  chunkIndex: number,
  startMs: number,
  endMs: number,
  ext: string,
): string {
  return R2_KEYS.chunk(orgId, recordingId, chunkIndex, startMs, endMs, ext);
}

export function artifactKey(
  orgId: string,
  recordingId: string,
  runId: string,
  fileName: string,
): string {
  return R2_KEYS.artifact(orgId, recordingId, runId, fileName);
}

export function workshopExportKey(
  orgId: string,
  workshopId: string,
  fileName: string,
): string {
  return R2_KEYS.workshopExport(orgId, workshopId, fileName);
}

const RECORDING_KEY_RE =
  /^org\/([^/]+)\/recording\/([^/]+)\//;

export function parseRecordingIdFromKey(
  key: string,
): { orgId: string; recordingId: string } | null {
  const m = RECORDING_KEY_RE.exec(key);
  if (!m) return null;
  return { orgId: m[1], recordingId: m[2] };
}

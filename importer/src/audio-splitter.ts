import { basename, join, extname } from "node:path";

export interface SilenceRegion {
  startMs: number;
  endMs: number;
  durationMs: number;
}

export interface ChunkInfo {
  index: number;
  startMs: number;
  endMs: number;
  path: string;
}

export async function detectSilence(
  filePath: string,
  thresholdDb: number = -35,
  minDurationMs: number = 800,
): Promise<SilenceRegion[]> {
  const minDurationSec = minDurationMs / 1000;
  const proc = Bun.spawn(
    [
      "ffmpeg",
      "-i", filePath,
      "-af", `silencedetect=noise=${thresholdDb}dB:d=${minDurationSec}`,
      "-f", "null",
      "-",
    ],
    { stdout: "pipe", stderr: "pipe" },
  );

  const stderr = await new Response(proc.stderr).text();
  await proc.exited;

  const regions: SilenceRegion[] = [];
  const lines = stderr.split("\n");

  let currentStart: number | null = null;

  for (const line of lines) {
    const startMatch = line.match(/silence_start:\s*([\d.]+)/);
    if (startMatch) {
      currentStart = Math.round(parseFloat(startMatch[1]) * 1000);
      continue;
    }

    const endMatch = line.match(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/);
    if (endMatch && currentStart !== null) {
      const endMs = Math.round(parseFloat(endMatch[1]) * 1000);
      const durationMs = Math.round(parseFloat(endMatch[2]) * 1000);
      regions.push({ startMs: currentStart, endMs, durationMs });
      currentStart = null;
    }
  }

  return regions;
}

export async function splitAudio(
  filePath: string,
  outputDir: string,
  maxChunkMs: number,
  overlapMs: number = 2000,
): Promise<ChunkInfo[]> {
  // Get total duration
  const durationMs = await getAudioDurationMs(filePath);
  if (durationMs <= maxChunkMs) {
    // No splitting needed; just return the file as single chunk
    return [{ index: 0, startMs: 0, endMs: durationMs, path: filePath }];
  }

  // Detect silence regions
  const silences = await detectSilence(filePath);

  // Find cut points at silence boundaries
  const cutPoints = findCutPoints(durationMs, maxChunkMs, silences, overlapMs);

  // Extract chunks
  const chunks: ChunkInfo[] = [];
  const baseName = basename(filePath, extname(filePath));

  for (let i = 0; i < cutPoints.length; i++) {
    const startMs = cutPoints[i];
    const endMs = i < cutPoints.length - 1 ? cutPoints[i + 1] + overlapMs : durationMs;
    const clampedEndMs = Math.min(endMs, durationMs);

    const chunkPath = join(outputDir, `${baseName}_chunk${String(i).padStart(3, "0")}.mp3`);
    const startSec = startMs / 1000;
    const durationSec = (clampedEndMs - startMs) / 1000;

    const proc = Bun.spawn(
      [
        "ffmpeg", "-y",
        "-i", filePath,
        "-ss", String(startSec),
        "-t", String(durationSec),
        "-ac", "1",
        "-ar", "16000",
        "-b:a", "64k",
        chunkPath,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`ffmpeg split failed for chunk ${i} (exit ${exitCode}): ${stderr}`);
    }

    chunks.push({
      index: i,
      startMs,
      endMs: clampedEndMs,
      path: chunkPath,
    });
  }

  return chunks;
}

function findCutPoints(
  totalDurationMs: number,
  maxChunkMs: number,
  silences: SilenceRegion[],
  overlapMs: number,
): number[] {
  const cutPoints: number[] = [0];
  let currentPos = 0;
  const searchWindowMs = 20000; // +/- 20 seconds around target boundary

  while (currentPos + maxChunkMs < totalDurationMs) {
    const targetBoundary = currentPos + maxChunkMs;

    // Search for the best silence region near the target boundary
    const windowStart = targetBoundary - searchWindowMs;
    const windowEnd = targetBoundary + searchWindowMs;

    let bestSilence: SilenceRegion | null = null;
    let bestDistance = Infinity;

    for (const silence of silences) {
      const silenceMid = (silence.startMs + silence.endMs) / 2;
      if (silenceMid >= windowStart && silenceMid <= windowEnd) {
        const distance = Math.abs(silenceMid - targetBoundary);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestSilence = silence;
        }
      }
    }

    if (bestSilence) {
      // Cut at the middle of the silence region
      const cutAt = Math.round((bestSilence.startMs + bestSilence.endMs) / 2);
      cutPoints.push(Math.max(cutAt - overlapMs, currentPos));
      currentPos = cutAt;
    } else {
      // No silence found; cut at the target boundary
      cutPoints.push(targetBoundary - overlapMs);
      currentPos = targetBoundary;
    }
  }

  return cutPoints;
}

async function getAudioDurationMs(filePath: string): Promise<number> {
  const proc = Bun.spawn(
    [
      "ffprobe",
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );

  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`ffprobe failed for ${filePath}`);
  }

  const durationSec = parseFloat(stdout.trim());
  return Math.round(durationSec * 1000);
}

import { extname } from "node:path";

const NEEDS_CONVERSION_EXTENSIONS = new Set([".wma"]);

// Large WAV threshold: files above this size are converted to save bandwidth
const LARGE_WAV_THRESHOLD = 50 * 1024 * 1024; // 50MB

export function needsConversion(fileName: string, fileSize?: number): boolean {
  const ext = extname(fileName).toLowerCase();
  if (NEEDS_CONVERSION_EXTENSIONS.has(ext)) return true;
  if (ext === ".wav" && fileSize !== undefined && fileSize > LARGE_WAV_THRESHOLD) return true;
  return false;
}

export async function convert(inputPath: string, outputPath: string): Promise<void> {
  const proc = Bun.spawn(
    ["ffmpeg", "-y", "-i", inputPath, "-ac", "1", "-ar", "16000", "-b:a", "64k", outputPath],
    { stdout: "pipe", stderr: "pipe" },
  );

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`ffmpeg conversion failed (exit ${exitCode}): ${stderr}`);
  }
}

export async function checkFfmpegAvailable(): Promise<boolean> {
  try {
    const proc = Bun.spawn(["ffmpeg", "-version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
}

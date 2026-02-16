import type { TranscriptSegment, TranscriptJson } from "../../../types/index.js";
import type { ChunkTranscript } from "./transcribe-chunks.js";

/**
 * Step 5: Merge chunk transcripts into a single transcript.
 * - Single chunk: use as-is
 * - Multiple chunks: apply overlap dedup algorithm
 *   - Previous chunk segments preferred unless avg confidence < 0.7
 *   - Re-number segment IDs (s-0001, s-0002, ...)
 */
export function mergeTranscripts(
  chunkTranscripts: ChunkTranscript[],
  recordingId: string,
  runId: string,
  provider: string,
  model: string,
): TranscriptJson {
  // Sort by chunk index
  const sorted = [...chunkTranscripts].sort(
    (a, b) => a.chunkIndex - b.chunkIndex,
  );

  let mergedSegments: TranscriptSegment[];

  if (sorted.length === 1) {
    mergedSegments = sorted[0].segments;
  } else {
    mergedSegments = mergeWithOverlapDedup(sorted);
  }

  // Re-number segment IDs
  const renumbered = renumberSegments(mergedSegments);

  const language = sorted[0]?.language ?? "ja";

  return {
    recordingId,
    runId,
    segments: renumbered,
    language,
    meta: { provider, model },
  };
}

/**
 * Merge multiple chunk transcripts with overlap deduplication.
 *
 * For each pair of adjacent chunks:
 * 1. Identify the overlap region (chunkN+1.startMs to chunkN.endMs)
 * 2. Find segments from each chunk that fall in the overlap
 * 3. Keep previous chunk's overlap segments if avg confidence >= 0.7
 *    Otherwise keep next chunk's overlap segments
 */
export function mergeWithOverlapDedup(
  sortedChunks: ChunkTranscript[],
): TranscriptSegment[] {
  if (sortedChunks.length === 0) return [];
  if (sortedChunks.length === 1) return sortedChunks[0].segments;

  const result: TranscriptSegment[] = [];

  for (let i = 0; i < sortedChunks.length; i++) {
    const currentChunk = sortedChunks[i];
    const nextChunk = sortedChunks[i + 1];

    if (!nextChunk) {
      // Last chunk: include all remaining segments
      result.push(...currentChunk.segments);
      break;
    }

    // Overlap region: from nextChunk's global start to currentChunk's global end
    const overlapStart = nextChunk.startMs;
    const overlapEnd = currentChunk.endMs;

    if (overlapStart >= overlapEnd) {
      // No overlap: include all segments from current chunk
      result.push(...currentChunk.segments);
      continue;
    }

    // Segments from current chunk: non-overlap + overlap
    const currentNonOverlap = currentChunk.segments.filter(
      (s) => s.startMs < overlapStart,
    );
    const currentOverlap = currentChunk.segments.filter(
      (s) => s.startMs >= overlapStart,
    );

    // Segments from next chunk in overlap region
    const nextOverlap = nextChunk.segments.filter(
      (s) => s.endMs <= overlapEnd,
    );

    // Always include non-overlap segments from current chunk
    result.push(...currentNonOverlap);

    // Decide which overlap segments to keep
    const avgConfCurrent = averageConfidence(currentOverlap);

    if (avgConfCurrent >= 0.7 || currentOverlap.length === 0) {
      // Keep current chunk's overlap segments
      result.push(...currentOverlap);
      // Remove those segments from next chunk to avoid double-counting
      // Filter next chunk to exclude segments already covered
      const nextFiltered = nextChunk.segments.filter(
        (s) => s.endMs > overlapEnd,
      );
      // Replace next chunk's segments with filtered version for subsequent iterations
      sortedChunks[i + 1] = { ...nextChunk, segments: nextFiltered };
    } else {
      // Keep next chunk's overlap segments instead
      result.push(...nextOverlap);
      // Remove overlap segments from next chunk (they're already added)
      // and keep only segments after overlap
      const nextFiltered = nextChunk.segments.filter(
        (s) => s.endMs > overlapEnd,
      );
      sortedChunks[i + 1] = { ...nextChunk, segments: nextFiltered };
    }
  }

  // Sort by startMs for consistent ordering
  result.sort((a, b) => a.startMs - b.startMs);

  return result;
}

/**
 * Calculate average confidence of segments. Returns 1.0 if empty.
 */
export function averageConfidence(segments: TranscriptSegment[]): number {
  if (segments.length === 0) return 1.0;
  const sum = segments.reduce((acc, s) => acc + s.confidence, 0);
  return sum / segments.length;
}

/**
 * Re-number segment IDs sequentially: s-0001, s-0002, ...
 */
export function renumberSegments(
  segments: TranscriptSegment[],
): TranscriptSegment[] {
  return segments.map((seg, index) => ({
    ...seg,
    segmentId: `s-${String(index + 1).padStart(4, "0")}`,
  }));
}

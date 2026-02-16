import { describe, it, expect } from "vitest";
import {
  mergeTranscripts,
  mergeWithOverlapDedup,
  averageConfidence,
  renumberSegments,
} from "../../../src/lib/server/workflow/steps/merge-transcripts.js";
import type { TranscriptSegment } from "../../../src/lib/types/index.js";
import type { ChunkTranscript } from "../../../src/lib/server/workflow/steps/transcribe-chunks.js";

function makeSegment(
  overrides: Partial<TranscriptSegment> & { segmentId: string },
): TranscriptSegment {
  return {
    speaker: "SPEAKER_1",
    startMs: 0,
    endMs: 1000,
    text: "test",
    confidence: 0.9,
    ...overrides,
  };
}

function makeChunkTranscript(
  overrides: Partial<ChunkTranscript> & {
    chunkIndex: number;
    segments: TranscriptSegment[];
  },
): ChunkTranscript {
  return {
    startMs: 0,
    endMs: 10000,
    language: "ja",
    ...overrides,
  };
}

describe("mergeTranscripts", () => {
  it("single chunk passes through with renumbered IDs", () => {
    const chunks: ChunkTranscript[] = [
      makeChunkTranscript({
        chunkIndex: 0,
        startMs: 0,
        endMs: 60000,
        segments: [
          makeSegment({ segmentId: "s-0001", startMs: 0, endMs: 5000, text: "hello" }),
          makeSegment({ segmentId: "s-0002", startMs: 5000, endMs: 10000, text: "world" }),
        ],
      }),
    ];

    const result = mergeTranscripts(chunks, "rec-1", "run-1", "gemini", "gemini-2.5-flash");

    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].segmentId).toBe("s-0001");
    expect(result.segments[0].text).toBe("hello");
    expect(result.segments[1].segmentId).toBe("s-0002");
    expect(result.segments[1].text).toBe("world");
    expect(result.recordingId).toBe("rec-1");
    expect(result.runId).toBe("run-1");
    expect(result.language).toBe("ja");
    expect(result.meta).toEqual({ provider: "gemini", model: "gemini-2.5-flash" });
  });

  it("two chunks with no overlap merges all segments", () => {
    const chunks: ChunkTranscript[] = [
      makeChunkTranscript({
        chunkIndex: 0,
        startMs: 0,
        endMs: 30000,
        segments: [
          makeSegment({ segmentId: "s-0001", startMs: 0, endMs: 10000, text: "first chunk seg 1" }),
          makeSegment({ segmentId: "s-0002", startMs: 10000, endMs: 20000, text: "first chunk seg 2" }),
        ],
      }),
      makeChunkTranscript({
        chunkIndex: 1,
        startMs: 30000,
        endMs: 60000,
        segments: [
          makeSegment({ segmentId: "s-0001", startMs: 30000, endMs: 40000, text: "second chunk seg 1" }),
          makeSegment({ segmentId: "s-0002", startMs: 40000, endMs: 50000, text: "second chunk seg 2" }),
        ],
      }),
    ];

    const result = mergeTranscripts(chunks, "rec-1", "run-1", "gemini", "gemini-2.5-flash");

    expect(result.segments).toHaveLength(4);
    // Verify renumbered IDs
    expect(result.segments[0].segmentId).toBe("s-0001");
    expect(result.segments[1].segmentId).toBe("s-0002");
    expect(result.segments[2].segmentId).toBe("s-0003");
    expect(result.segments[3].segmentId).toBe("s-0004");
    // Verify text ordering
    expect(result.segments[0].text).toBe("first chunk seg 1");
    expect(result.segments[1].text).toBe("first chunk seg 2");
    expect(result.segments[2].text).toBe("second chunk seg 1");
    expect(result.segments[3].text).toBe("second chunk seg 2");
  });

  it("two chunks with overlap - high confidence keeps previous chunk segments", () => {
    // Chunk 0: 0-32000ms, Chunk 1: 30000-60000ms (overlap: 30000-32000)
    const chunks: ChunkTranscript[] = [
      makeChunkTranscript({
        chunkIndex: 0,
        startMs: 0,
        endMs: 32000,
        segments: [
          makeSegment({ segmentId: "s-0001", startMs: 0, endMs: 15000, text: "before overlap", confidence: 0.95 }),
          makeSegment({ segmentId: "s-0002", startMs: 15000, endMs: 29000, text: "still before", confidence: 0.92 }),
          makeSegment({ segmentId: "s-0003", startMs: 30000, endMs: 32000, text: "overlap from prev (high conf)", confidence: 0.85 }),
        ],
      }),
      makeChunkTranscript({
        chunkIndex: 1,
        startMs: 30000,
        endMs: 60000,
        segments: [
          makeSegment({ segmentId: "s-0001", startMs: 30000, endMs: 32000, text: "overlap from next", confidence: 0.80 }),
          makeSegment({ segmentId: "s-0002", startMs: 35000, endMs: 45000, text: "after overlap", confidence: 0.90 }),
        ],
      }),
    ];

    const result = mergeTranscripts(chunks, "rec-1", "run-1", "gemini", "gemini-2.5-flash");

    // Previous chunk's overlap segment (confidence 0.85 >= 0.7) should be kept
    const texts = result.segments.map((s) => s.text);
    expect(texts).toContain("before overlap");
    expect(texts).toContain("still before");
    expect(texts).toContain("overlap from prev (high conf)");
    expect(texts).not.toContain("overlap from next");
    expect(texts).toContain("after overlap");
  });

  it("two chunks with overlap - low confidence keeps next chunk segments", () => {
    // Chunk 0: 0-32000ms, Chunk 1: 30000-60000ms (overlap: 30000-32000)
    const chunks: ChunkTranscript[] = [
      makeChunkTranscript({
        chunkIndex: 0,
        startMs: 0,
        endMs: 32000,
        segments: [
          makeSegment({ segmentId: "s-0001", startMs: 0, endMs: 15000, text: "before overlap", confidence: 0.95 }),
          makeSegment({ segmentId: "s-0002", startMs: 30000, endMs: 32000, text: "overlap from prev (low conf)", confidence: 0.50 }),
        ],
      }),
      makeChunkTranscript({
        chunkIndex: 1,
        startMs: 30000,
        endMs: 60000,
        segments: [
          makeSegment({ segmentId: "s-0001", startMs: 30000, endMs: 32000, text: "overlap from next (better)", confidence: 0.88 }),
          makeSegment({ segmentId: "s-0002", startMs: 35000, endMs: 45000, text: "after overlap", confidence: 0.90 }),
        ],
      }),
    ];

    const result = mergeTranscripts(chunks, "rec-1", "run-1", "gemini", "gemini-2.5-flash");

    // Previous chunk's overlap segment confidence (0.50) < 0.7, so next chunk's overlap is used
    const texts = result.segments.map((s) => s.text);
    expect(texts).toContain("before overlap");
    expect(texts).not.toContain("overlap from prev (low conf)");
    expect(texts).toContain("overlap from next (better)");
    expect(texts).toContain("after overlap");
  });
});

describe("renumberSegments", () => {
  it("renumbers segment IDs sequentially from s-0001", () => {
    const segments: TranscriptSegment[] = [
      makeSegment({ segmentId: "old-1", startMs: 0, endMs: 1000 }),
      makeSegment({ segmentId: "old-2", startMs: 1000, endMs: 2000 }),
      makeSegment({ segmentId: "old-3", startMs: 2000, endMs: 3000 }),
    ];

    const result = renumberSegments(segments);

    expect(result[0].segmentId).toBe("s-0001");
    expect(result[1].segmentId).toBe("s-0002");
    expect(result[2].segmentId).toBe("s-0003");
    // Original data preserved
    expect(result[0].startMs).toBe(0);
    expect(result[1].startMs).toBe(1000);
    expect(result[2].startMs).toBe(2000);
  });

  it("handles empty array", () => {
    expect(renumberSegments([])).toEqual([]);
  });
});

describe("averageConfidence", () => {
  it("returns 1.0 for empty array", () => {
    expect(averageConfidence([])).toBe(1.0);
  });

  it("calculates average correctly", () => {
    const segments = [
      makeSegment({ segmentId: "s-1", confidence: 0.8 }),
      makeSegment({ segmentId: "s-2", confidence: 0.6 }),
    ];
    expect(averageConfidence(segments)).toBe(0.7);
  });

  it("handles single segment", () => {
    const segments = [makeSegment({ segmentId: "s-1", confidence: 0.95 })];
    expect(averageConfidence(segments)).toBe(0.95);
  });
});

describe("mergeWithOverlapDedup", () => {
  it("returns empty for empty input", () => {
    expect(mergeWithOverlapDedup([])).toEqual([]);
  });

  it("returns single chunk segments unchanged", () => {
    const chunks: ChunkTranscript[] = [
      makeChunkTranscript({
        chunkIndex: 0,
        startMs: 0,
        endMs: 30000,
        segments: [
          makeSegment({ segmentId: "s-0001", startMs: 0, endMs: 10000, text: "hello" }),
        ],
      }),
    ];

    const result = mergeWithOverlapDedup(chunks);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("hello");
  });

  it("handles three chunks with overlaps", () => {
    const chunks: ChunkTranscript[] = [
      makeChunkTranscript({
        chunkIndex: 0,
        startMs: 0,
        endMs: 22000,
        segments: [
          makeSegment({ segmentId: "s-1", startMs: 0, endMs: 10000, text: "chunk0-a", confidence: 0.9 }),
          makeSegment({ segmentId: "s-2", startMs: 10000, endMs: 19000, text: "chunk0-b", confidence: 0.9 }),
          makeSegment({ segmentId: "s-3", startMs: 20000, endMs: 22000, text: "chunk0-overlap", confidence: 0.85 }),
        ],
      }),
      makeChunkTranscript({
        chunkIndex: 1,
        startMs: 20000,
        endMs: 42000,
        segments: [
          makeSegment({ segmentId: "s-1", startMs: 20000, endMs: 22000, text: "chunk1-overlap-start", confidence: 0.7 }),
          makeSegment({ segmentId: "s-2", startMs: 25000, endMs: 35000, text: "chunk1-middle", confidence: 0.9 }),
          makeSegment({ segmentId: "s-3", startMs: 40000, endMs: 42000, text: "chunk1-overlap-end", confidence: 0.88 }),
        ],
      }),
      makeChunkTranscript({
        chunkIndex: 2,
        startMs: 40000,
        endMs: 60000,
        segments: [
          makeSegment({ segmentId: "s-1", startMs: 40000, endMs: 42000, text: "chunk2-overlap", confidence: 0.75 }),
          makeSegment({ segmentId: "s-2", startMs: 45000, endMs: 55000, text: "chunk2-end", confidence: 0.92 }),
        ],
      }),
    ];

    const result = mergeWithOverlapDedup(chunks);

    const texts = result.map((s) => s.text);
    // Chunk 0 non-overlap
    expect(texts).toContain("chunk0-a");
    expect(texts).toContain("chunk0-b");
    // Chunk 0-1 overlap: chunk0 confidence 0.85 >= 0.7, so prev kept
    expect(texts).toContain("chunk0-overlap");
    expect(texts).not.toContain("chunk1-overlap-start");
    // Chunk 1 non-overlap
    expect(texts).toContain("chunk1-middle");
    // Chunk 2 end
    expect(texts).toContain("chunk2-end");
  });
});

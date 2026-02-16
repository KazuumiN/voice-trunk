import { describe, it, expect } from "vitest";
import {
  rawKey,
  chunkKey,
  artifactKey,
  workshopExportKey,
  parseRecordingIdFromKey,
} from "../../../src/lib/server/r2/keys.js";

describe("R2 key construction", () => {
  const orgId = "org-abc123";
  const recordingId = "recfile-def456";

  describe("rawKey", () => {
    it("constructs correct path for raw audio", () => {
      expect(rawKey(orgId, recordingId, "VOICE001.WAV")).toBe(
        "org/org-abc123/recording/recfile-def456/raw/VOICE001.WAV",
      );
    });

    it("handles filenames with spaces", () => {
      expect(rawKey(orgId, recordingId, "my recording.mp3")).toBe(
        "org/org-abc123/recording/recfile-def456/raw/my recording.mp3",
      );
    });
  });

  describe("chunkKey", () => {
    it("constructs correct path for audio chunk", () => {
      expect(chunkKey(orgId, recordingId, 0, 0, 300000, "wav")).toBe(
        "org/org-abc123/recording/recfile-def456/chunks/0_0_300000.wav",
      );
    });

    it("constructs correct path for later chunk index", () => {
      expect(chunkKey(orgId, recordingId, 3, 900000, 1200000, "mp3")).toBe(
        "org/org-abc123/recording/recfile-def456/chunks/3_900000_1200000.mp3",
      );
    });
  });

  describe("artifactKey", () => {
    it("constructs correct path for transcript artifact", () => {
      const runId = "run-789";
      expect(artifactKey(orgId, recordingId, runId, "transcript.json")).toBe(
        "org/org-abc123/recording/recfile-def456/runs/run-789/transcript.json",
      );
    });

    it("constructs correct path for summary artifact", () => {
      const runId = "run-xyz";
      expect(artifactKey(orgId, recordingId, runId, "summary.json")).toBe(
        "org/org-abc123/recording/recfile-def456/runs/run-xyz/summary.json",
      );
    });
  });

  describe("workshopExportKey", () => {
    it("constructs correct path for workshop export", () => {
      expect(workshopExportKey(orgId, "ws-001", "report.pdf")).toBe(
        "org/org-abc123/workshop/ws-001/exports/report.pdf",
      );
    });
  });
});

describe("parseRecordingIdFromKey", () => {
  it("parses orgId and recordingId from a raw key", () => {
    const key = "org/org-abc123/recording/recfile-def456/raw/VOICE001.WAV";
    expect(parseRecordingIdFromKey(key)).toEqual({
      orgId: "org-abc123",
      recordingId: "recfile-def456",
    });
  });

  it("parses orgId and recordingId from a chunk key", () => {
    const key =
      "org/org-abc123/recording/recfile-def456/chunks/0_0_300000.wav";
    expect(parseRecordingIdFromKey(key)).toEqual({
      orgId: "org-abc123",
      recordingId: "recfile-def456",
    });
  });

  it("parses orgId and recordingId from an artifact key", () => {
    const key =
      "org/org-abc123/recording/recfile-def456/runs/run-789/transcript.json";
    expect(parseRecordingIdFromKey(key)).toEqual({
      orgId: "org-abc123",
      recordingId: "recfile-def456",
    });
  });

  it("returns null for a workshop export key (no recordingId)", () => {
    const key = "org/org-abc123/workshop/ws-001/exports/report.pdf";
    expect(parseRecordingIdFromKey(key)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseRecordingIdFromKey("")).toBeNull();
  });

  it("returns null for a malformed key", () => {
    expect(parseRecordingIdFromKey("some/random/path")).toBeNull();
  });

  it("returns null for a key missing the recording segment", () => {
    expect(parseRecordingIdFromKey("org/org-abc123/other/thing")).toBeNull();
  });
});

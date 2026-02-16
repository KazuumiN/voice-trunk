import type { WorkflowStepName } from "./types/index.js";

// ===== Error Codes =====
export const ErrorCode = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  DUPLICATE_RECORDING: "DUPLICATE_RECORDING",
  DEVICE_NOT_FOUND: "DEVICE_NOT_FOUND",
  UPLOAD_EXPIRED: "UPLOAD_EXPIRED",
  BATCH_LIMIT_EXCEEDED: "BATCH_LIMIT_EXCEEDED",
  PROCESSING_FAILED: "PROCESSING_FAILED",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  GEMINI_RATE_LIMITED: "GEMINI_RATE_LIMITED",
  INVALID_STATUS_TRANSITION: "INVALID_STATUS_TRANSITION",
  VALIDATION_ERROR: "VALIDATION_ERROR",
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

// ===== Workflow Steps (ordered) =====
export const WORKFLOW_STEPS: WorkflowStepName[] = [
  "load_metadata",
  "ensure_audio_access",
  "maybe_split_audio",
  "transcribe_chunks",
  "merge_transcripts",
  "summarize",
  "claims_extract",
  "grouping",
  "index_for_search",
  "notify",
  "finalize",
];

// ===== Model Limits =====
export const MODEL_LIMITS: Record<
  string,
  { maxBytes: number; maxAudioTokens: number; tokensPerSec: number }
> = {
  "gemini-2.5-flash": {
    maxBytes: 2_000_000_000, // 2GB
    maxAudioTokens: 1_000_000,
    tokensPerSec: 32,
  },
  "gemini-2.5-pro": {
    maxBytes: 2_000_000_000,
    maxAudioTokens: 1_000_000,
    tokensPerSec: 32,
  },
};

// ===== Pagination Defaults =====
export const PAGINATION = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 200,
  DEFAULT_SORT: "createdAt:desc",
} as const;

// ===== Batch Limits =====
export const BATCH_PREFLIGHT_MAX = 200;

// ===== Multipart Upload =====
export const MULTIPART = {
  THRESHOLD_BYTES: 100 * 1024 * 1024, // 100MB
  PART_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
  MAX_PARTS: 10_000,
  MAX_CONCURRENT: 4,
} as const;

// ===== R2 Key Patterns =====
export const R2_KEYS = {
  raw: (orgId: string, recordingId: string, fileName: string) =>
    `org/${orgId}/recording/${recordingId}/raw/${fileName}`,
  chunk: (
    orgId: string,
    recordingId: string,
    chunkIndex: number,
    startMs: number,
    endMs: number,
    ext: string,
  ) =>
    `org/${orgId}/recording/${recordingId}/chunks/${chunkIndex}_${startMs}_${endMs}.${ext}`,
  artifact: (
    orgId: string,
    recordingId: string,
    runId: string,
    fileName: string,
  ) =>
    `org/${orgId}/recording/${recordingId}/runs/${runId}/${fileName}`,
  workshopExport: (orgId: string, workshopId: string, fileName: string) =>
    `org/${orgId}/workshop/${workshopId}/exports/${fileName}`,
} as const;

// ===== ID Prefixes =====
export const ID_PREFIX = {
  org: "org",
  user: "usr",
  device: "dev",
  workshop: "ws",
  workshopDraft: "wsd",
  importBatch: "batch",
  recording: "recfile",
  chunk: "chunk",
  processingRun: "run",
  artifact: "art",
  auditLog: "audit",
  upload: "upl",
  serviceToken: "stk",
} as const;

// ===== Presigned URL TTL =====
export const PRESIGN_TTL = {
  UPLOAD_DEFAULT_SECONDS: 86400, // 24 hours
  UPLOAD_MAX_SECONDS: 604800, // 7 days
  GEMINI_MIN_SECONDS: 3600, // 1 hour
  REFRESH_THRESHOLD_SECONDS: 300, // 5 minutes
} as const;

// ===== R2 Bucket Names =====
export const R2_BUCKET = {
  RAW_AUDIO: "raw-audio",
  ARTIFACTS: "artifacts",
} as const;

// ===== Web Upload =====
export const WEB_UPLOAD = {
  ALLOWED_EXTENSIONS: ["wav", "mp3", "wma", "m4a", "flac", "ogg"],
  MAX_FILE_SIZE_BYTES: 2_000_000_000,
  MAX_FILES_PER_SESSION: 50,
} as const;

// ===== Polling =====
export const POLLING_INTERVAL_MS = 10_000;

// ===== Recording Status =====
export type RecordingStatus =
  | "REGISTERED"
  | "UPLOADING"
  | "UPLOADED"
  | "PROCESSING"
  | "PARTIAL"
  | "DONE"
  | "ERROR";

// ===== Import Batch Status =====
export type ImportBatchStatus =
  | "OPEN"
  | "UPLOADING"
  | "COMPLETED"
  | "PARTIAL_ERROR";

// ===== Workshop Draft Status =====
export type WorkshopDraftStatus =
  | "DRAFT"
  | "CONFIRMED"
  | "MERGED"
  | "DISCARDED";

// ===== Processing Run Status =====
export type ProcessingRunStatus =
  | "RUNNING"
  | "DONE"
  | "PARTIAL"
  | "ERROR";

// ===== Claim Stance =====
export type ClaimStance = "AFFIRM" | "NEGATE" | "UNCERTAIN" | "REPORTING";

// ===== Artifact Type =====
export type ArtifactType =
  | "transcript"
  | "summary"
  | "claims"
  | "diarization"
  | "debug";

// ===== Actor Type =====
export type ActorType = "user" | "service_token";

// ===== Device Status =====
export type DeviceStatus = "active" | "inactive";

// ===== User Role =====
export type UserRole = "admin" | "member" | "viewer";

// ===== DB Row Types =====

export interface Org {
  id: string;
  name: string;
  retentionDays: number;
  createdAt: string;
}

export interface User {
  id: string;
  orgId: string;
  accessSub: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
}

export interface Device {
  id: string;
  orgId: string;
  label: string;
  expectedIdentifierFileName: string;
  status: DeviceStatus;
  createdAt: string;
}

export interface Workshop {
  id: string;
  orgId: string;
  title: string;
  date: string;
  location: string;
  agendaR2Key: string | null;
  createdBy: string;
  createdAt: string;
}

export interface WorkshopDraft {
  id: string;
  orgId: string;
  importBatchId: string;
  status: WorkshopDraftStatus;
  title: string | null;
  confidenceScore: number;
  reason: string | null;
  confirmedWorkshopId: string | null;
  mergedIntoId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImportBatch {
  id: string;
  orgId: string;
  createdBy: string;
  startedAt: string;
  endedAt: string | null;
  notes: string | null;
  status: ImportBatchStatus;
  totalFiles: number;
  uploadedFiles: number;
  errorFiles: number;
}

export interface Recording {
  id: string;
  orgId: string;
  deviceId: string | null;
  importBatchId: string;
  workshopId: string | null;
  draftId: string | null;
  originalFileName: string;
  recorderFileCreatedAt: string | null;
  sizeBytes: number;
  sha256: string;
  durationMs: number | null;
  mimeType: string;
  needsConversion: number; // D1 boolean (0/1)
  convertedR2Key: string | null;
  rawR2Key: string;
  status: RecordingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RecordingChunk {
  id: string;
  recordingId: string;
  chunkIndex: number;
  startMs: number;
  endMs: number;
  r2Key: string;
  sha256: string | null;
  createdAt: string;
}

export interface ProcessingRun {
  id: string;
  recordingId: string;
  orgId: string;
  provider: string;
  model: string;
  configJson: string;
  status: ProcessingRunStatus;
  completedSteps: string; // JSON array string
  failedStep: string | null;
  retryCount: number;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

export interface Artifact {
  id: string;
  runId: string;
  orgId: string;
  type: ArtifactType;
  r2Key: string;
  contentHash: string | null;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  orgId: string;
  actorType: ActorType;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  ip: string | null;
  ua: string | null;
  createdAt: string;
}

export interface GeminiSemaphore {
  id: string;
  orgId: string;
  acquiredBy: string;
  acquiredAt: string;
  expiresAt: string;
}

// ===== API Types =====

export interface PaginationParams {
  limit: number;
  cursor?: string;
  sort: string;
}

export interface PaginationResult {
  hasMore: boolean;
  nextCursor: string | null;
  totalCount: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationResult;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// ===== Preflight Types =====

export interface PreflightRequest {
  deviceId?: string;
  originalFileName: string;
  recorderFileCreatedAt?: string;
  sizeBytes: number;
  sha256: string;
}

export interface PreflightResult {
  sha256: string;
  status: "ALREADY_EXISTS" | "NEW";
  recordingId: string;
  uploadId?: string;
  rawR2Key?: string;
}

// ===== Transcript Types =====

export interface TranscriptSegment {
  segmentId: string;
  speaker: string;
  startMs: number;
  endMs: number;
  text: string;
  confidence: number;
}

export interface TranscriptJson {
  recordingId: string;
  runId: string;
  segments: TranscriptSegment[];
  language: string;
  meta: { provider: string; model: string };
}

// ===== Claims Types =====

export interface Claim {
  claimId: string;
  normalized: string;
  stance: ClaimStance;
  speaker: string;
  startMs: number;
  endMs: number;
  quote: string;
  evidenceSegmentIds: string[];
}

export interface ClaimsJson {
  claims: Claim[];
}

// ===== Summary Types =====

export interface SummaryJson {
  recordingId: string;
  runId: string;
  shortSummary: string;
  longSummary: string;
  keyPoints: string[];
  decisions: string[];
  openItems: string[];
}

// ===== Workflow Types =====

export type WorkflowStepName =
  | "load_metadata"
  | "ensure_audio_access"
  | "maybe_split_audio"
  | "transcribe_chunks"
  | "merge_transcripts"
  | "summarize"
  | "claims_extract"
  | "grouping"
  | "index_for_search"
  | "notify"
  | "finalize";

export interface WorkflowInput {
  recordingId: string;
  orgId: string;
  runId: string;
  fromStep?: WorkflowStepName;
}

-- Migration: 0001_initial_schema
-- Description: Create all 12 tables for voice-trunk

-- ===== orgs =====
CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  retentionDays INTEGER NOT NULL DEFAULT 365,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== users =====
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  orgId TEXT NOT NULL REFERENCES orgs(id),
  accessSub TEXT NOT NULL,
  email TEXT NOT NULL,
  displayName TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== devices =====
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  orgId TEXT NOT NULL REFERENCES orgs(id),
  label TEXT NOT NULL,
  expectedIdentifierFileName TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== workshops =====
CREATE TABLE IF NOT EXISTS workshops (
  id TEXT PRIMARY KEY,
  orgId TEXT NOT NULL REFERENCES orgs(id),
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  location TEXT NOT NULL,
  agendaR2Key TEXT,
  createdBy TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== import_batches =====
CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY,
  orgId TEXT NOT NULL REFERENCES orgs(id),
  createdBy TEXT NOT NULL,
  startedAt TEXT NOT NULL DEFAULT (datetime('now')),
  endedAt TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'UPLOADING', 'COMPLETED', 'PARTIAL_ERROR')),
  totalFiles INTEGER NOT NULL DEFAULT 0,
  uploadedFiles INTEGER NOT NULL DEFAULT 0,
  errorFiles INTEGER NOT NULL DEFAULT 0
);

-- ===== workshop_drafts =====
CREATE TABLE IF NOT EXISTS workshop_drafts (
  id TEXT PRIMARY KEY,
  orgId TEXT NOT NULL REFERENCES orgs(id),
  importBatchId TEXT NOT NULL REFERENCES import_batches(id),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'CONFIRMED', 'MERGED', 'DISCARDED')),
  title TEXT,
  confidenceScore REAL NOT NULL DEFAULT 0.0,
  reason TEXT,
  confirmedWorkshopId TEXT REFERENCES workshops(id),
  mergedIntoId TEXT REFERENCES workshop_drafts(id),
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== recordings =====
CREATE TABLE IF NOT EXISTS recordings (
  id TEXT PRIMARY KEY,
  orgId TEXT NOT NULL REFERENCES orgs(id),
  deviceId TEXT NOT NULL REFERENCES devices(id),
  importBatchId TEXT NOT NULL REFERENCES import_batches(id),
  workshopId TEXT REFERENCES workshops(id),
  draftId TEXT REFERENCES workshop_drafts(id),
  originalFileName TEXT NOT NULL,
  recorderFileCreatedAt TEXT,
  sizeBytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  durationMs INTEGER,
  mimeType TEXT NOT NULL,
  needsConversion INTEGER NOT NULL DEFAULT 0,
  convertedR2Key TEXT,
  rawR2Key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'REGISTERED' CHECK (status IN ('REGISTERED', 'UPLOADING', 'UPLOADED', 'PROCESSING', 'PARTIAL', 'DONE', 'ERROR')),
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(orgId, sha256)
);

-- ===== recording_chunks =====
CREATE TABLE IF NOT EXISTS recording_chunks (
  id TEXT PRIMARY KEY,
  recordingId TEXT NOT NULL REFERENCES recordings(id),
  chunkIndex INTEGER NOT NULL,
  startMs INTEGER NOT NULL,
  endMs INTEGER NOT NULL,
  r2Key TEXT NOT NULL,
  sha256 TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== processing_runs =====
CREATE TABLE IF NOT EXISTS processing_runs (
  id TEXT PRIMARY KEY,
  recordingId TEXT NOT NULL REFERENCES recordings(id),
  orgId TEXT NOT NULL REFERENCES orgs(id),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  configJson TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'DONE', 'PARTIAL', 'ERROR')),
  completedSteps TEXT NOT NULL DEFAULT '[]',
  failedStep TEXT,
  retryCount INTEGER NOT NULL DEFAULT 0,
  startedAt TEXT NOT NULL DEFAULT (datetime('now')),
  finishedAt TEXT,
  error TEXT
);

-- ===== artifacts =====
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  runId TEXT NOT NULL REFERENCES processing_runs(id),
  orgId TEXT NOT NULL REFERENCES orgs(id),
  type TEXT NOT NULL CHECK (type IN ('transcript', 'summary', 'claims', 'diarization', 'debug')),
  r2Key TEXT NOT NULL,
  contentHash TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== gemini_semaphore =====
CREATE TABLE IF NOT EXISTS gemini_semaphore (
  id TEXT PRIMARY KEY,
  orgId TEXT NOT NULL,
  acquiredBy TEXT NOT NULL,
  acquiredAt TEXT NOT NULL DEFAULT (datetime('now')),
  expiresAt TEXT NOT NULL
);

-- ===== audit_logs =====
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  orgId TEXT NOT NULL REFERENCES orgs(id),
  actorType TEXT NOT NULL CHECK (actorType IN ('user', 'service_token')),
  actorId TEXT NOT NULL,
  action TEXT NOT NULL,
  targetType TEXT NOT NULL,
  targetId TEXT NOT NULL,
  ip TEXT,
  ua TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== Indexes =====
CREATE INDEX IF NOT EXISTS idx_recordings_org_status ON recordings(orgId, status);
CREATE INDEX IF NOT EXISTS idx_recordings_org_sha256 ON recordings(orgId, sha256);
CREATE INDEX IF NOT EXISTS idx_recordings_import_batch ON recordings(importBatchId);
CREATE INDEX IF NOT EXISTS idx_recording_chunks_recording ON recording_chunks(recordingId);
CREATE INDEX IF NOT EXISTS idx_processing_runs_recording ON processing_runs(recordingId);
CREATE INDEX IF NOT EXISTS idx_artifacts_run ON artifacts(runId);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created ON audit_logs(orgId, createdAt);
CREATE INDEX IF NOT EXISTS idx_workshop_drafts_import_batch ON workshop_drafts(importBatchId);

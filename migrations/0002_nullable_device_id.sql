-- Migration: 0002_nullable_device_id
-- Description: Make recordings.deviceId nullable to support direct web uploads

-- Step 1: Create new table without NOT NULL on deviceId
CREATE TABLE recordings_new (
  id TEXT PRIMARY KEY,
  orgId TEXT NOT NULL REFERENCES orgs(id),
  deviceId TEXT REFERENCES devices(id),
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

-- Step 2: Copy all existing data
INSERT INTO recordings_new SELECT * FROM recordings;

-- Step 3: Drop old table
DROP TABLE recordings;

-- Step 4: Rename new table
ALTER TABLE recordings_new RENAME TO recordings;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_recordings_org_status ON recordings(orgId, status);
CREATE INDEX IF NOT EXISTS idx_recordings_org_sha256 ON recordings(orgId, sha256);
CREATE INDEX IF NOT EXISTS idx_recordings_import_batch ON recordings(importBatchId);

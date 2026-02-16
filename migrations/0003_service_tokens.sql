-- Migration: 0003_service_tokens
-- Description: Create service_tokens table for desktop app / API authentication

CREATE TABLE IF NOT EXISTS service_tokens (
  id TEXT PRIMARY KEY,
  orgId TEXT NOT NULL REFERENCES orgs(id),
  label TEXT NOT NULL,
  clientId TEXT NOT NULL UNIQUE,
  clientSecret TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  revokedAt TEXT
);

CREATE INDEX IF NOT EXISTS idx_service_tokens_org ON service_tokens(orgId);
CREATE INDEX IF NOT EXISTS idx_service_tokens_client_id ON service_tokens(clientId);

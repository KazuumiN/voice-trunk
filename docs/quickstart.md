# Quick Start (Shortest Path)

This guide shows the shortest path to getting the system running. See [setup-guide.md](./setup-guide.md) for full details.

---

## Step 1: Create Cloudflare Resources (first time only, ~5 min)

```bash
# Login
wrangler login

# D1 database
wrangler d1 create voice-trunk-db
# → Copy the output database_id into wrangler.toml

# R2 buckets
wrangler r2 bucket create r2-raw-audio
wrangler r2 bucket create r2-artifacts

# Queue
wrangler queues create recording-upload-queue

# R2 event notification
wrangler r2 bucket notification create r2-raw-audio \
  --event-type object-create \
  --queue recording-upload-queue
```

## Step 2: Set Secrets (first time only, ~5 min)

```bash
wrangler secret put GEMINI_API_KEY
wrangler secret put CF_ACCESS_TEAM_DOMAIN
wrangler secret put CF_ACCESS_AUD
wrangler secret put R2_ACCOUNT_ID
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY
```

## Step 3: Build + Deploy (~2 min)

```bash
bun install
bun run build

# Migration (remote)
wrangler d1 migrations apply voice-trunk-db --remote

# Deploy
wrangler deploy
```

## Step 4: Seed Initial Data (first time only, ~3 min)

Register the organization, users, and devices in D1:

```bash
wrangler d1 execute voice-trunk-db --remote --command "
INSERT INTO orgs (id, name) VALUES ('org-yourorg', 'Your Organization Name');
INSERT INTO users (id, orgId, accessSub, email, displayName, role) VALUES ('usr-admin01', 'org-yourorg', 'Your Cloudflare Access sub value', 'you@example.com', 'Your Name', 'admin');
INSERT INTO devices (id, orgId, label, expectedIdentifierFileName) VALUES ('dev-table1', 'org-yourorg', 'Table-1', 'RECORDER_ID.json');
INSERT INTO devices (id, orgId, label, expectedIdentifierFileName) VALUES ('dev-table2', 'org-yourorg', 'Table-2', 'RECORDER_ID.json');
INSERT INTO devices (id, orgId, label, expectedIdentifierFileName) VALUES ('dev-table3', 'org-yourorg', 'Table-3', 'RECORDER_ID.json');
"
```

## Step 5: Place Identifier Files on Recorders (first time only)

Create a `RECORDER_ID.json` file at the USB root of each recorder:

```json
{
  "deviceId": "dev-table1",
  "label": "Table-1"
}
```

## Step 6: Import Tool (two options)

### Option A: Desktop App (recommended)

GUI-based, suitable for non-developer staff.

```bash
# Prerequisite: Rust is required
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# ffmpeg
brew install ffmpeg

# Build + run
cd desktop && npm install && npm run tauri dev
```

Enter the server URL and authentication credentials in the app's settings screen.
See [desktop/README.md](../desktop/README.md) for details.

### Option B: CLI Importer (legacy, for developers)

For developers comfortable with the terminal.

```bash
# Install dependencies
cd importer && bun install && cd ..

# ffmpeg
brew install ffmpeg

# Create config file
mkdir -p ~/Library/Application\ Support/voice-trunk
cat > ~/Library/Application\ Support/voice-trunk/config.json << 'EOF'
{
  "maxStorageGB": 50,
  "serverUrl": "https://voice-trunk.YOUR-SUBDOMAIN.workers.dev",
  "authMode": "service_token",
  "clientId": "YOUR_CLIENT_ID",
  "clientSecret": "YOUR_CLIENT_SECRET"
}
EOF
```

## Step 7: Start Using

### Desktop App

1. Launch the app (it stays in the system tray)
2. Connect a recorder via USB -- it is detected automatically
3. Click "Import" to start importing

### CLI Importer

```bash
# Start the importer (stays running in the terminal)
bun run importer/src/index.ts watch
```

### Auto-Import Flow

Regardless of which tool you use, after connecting a recorder the following happens automatically:

1. New audio files are detected
2. Files are copied locally (deduplicated via SHA-256)
3. Converted to MP3 if needed
4. Uploaded to R2
5. Transcription, summarization, and claim extraction run automatically

View results in the Web UI at the deployed Workers URL.

---

## Daemonizing the CLI Importer (auto-start on Mac login)

```bash
mkdir -p ~/Library/Logs/voice-trunk
cp importer/com.voice-trunk.importer.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.voice-trunk.importer.plist
```

## Common Commands

```bash
# CLI Importer: check status
bun run importer/src/index.ts status

# CLI Importer: manually retry uploads
bun run importer/src/index.ts upload

# CLI Importer: delete completed batches (free disk space)
bun run importer/src/index.ts clean

# Run tests
bun run test

# Server local development
bun run dev

# Desktop app development
cd desktop && npm run tauri dev
```

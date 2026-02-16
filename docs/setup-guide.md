# VoiceTrunk Setup & Operations Guide

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Prerequisites](#2-prerequisites)
3. [Cloudflare Environment Setup](#3-cloudflare-environment-setup)
4. [Local Development Environment](#4-local-development-environment)
5. [Production Deploy](#5-production-deploy)
6. [Importer (Import Tool) Setup](#6-importer-import-tool-setup)
6b. [Desktop App (Recommended)](#6b-desktop-app-recommended)
7. [Recorder Preparation](#7-recorder-preparation)
8. [Daily Operation Flow](#8-daily-operation-flow)
9. [Web UI Guide](#9-web-ui-guide)
10. [Troubleshooting](#10-troubleshooting)
11. [Architecture Details](#11-architecture-details)

---

## 1. System Overview

"VoiceTrunk" is a system that **automatically ingests workshop voice recordings from USB recorders, uploads them to the cloud, and processes them (transcription, summarization, claim extraction)**.

```
┌──────────────────────┐     ┌────────────────────────────────────────────┐
│ Staff's Mac           │     │ Cloudflare                                  │
│                      │     │                                            │
│  Recorder via USB    │     │  ┌─────────┐  ┌────┐  ┌──────────────┐   │
│    ↓                 │     │  │ SvelteKit│  │ D1 │  │ R2 (audio)    │   │
│  Desktop App         │────→│  │ Web+API  │  │ DB │  │ R2 (artifacts)│   │
│  (Tauri v2,          │     │  └─────────┘  └────┘  └──────────────┘   │
│   recommended)       │     │       ↑                      ↓            │
│  or                  │     │  ┌─────────┐  ┌──────────────────────┐   │
│  CLI Importer        │     │  │ Queue   │←─│ R2 Event Notification │   │
│  (Bun, for devs)     │     │  └────┬────┘  └──────────────────────┘   │
│                      │     │       ↓                                   │
│                      │     │  ┌──────────────────────────────────┐    │
│                      │     │  │ Workflow (11-step pipeline)       │    │
│                      │     │  │ → Transcribe → Summarize → Claims │    │
│                      │     │  └──────────────────────────────────┘    │
│                      │     │       ↓                                   │
│                      │     │  Gemini API (external)                    │
└──────────────────────┘     └────────────────────────────────────────────┘
```

### Processing Flow

1. Staff connects a recorder to the Mac via USB
2. The importer automatically detects new audio files
3. SHA-256 deduplication check -- only new files are copied and uploaded
4. Upload to R2 completes -- the processing pipeline starts automatically
5. Gemini API transcribes, then summarizes, then extracts claims with automatic grouping
6. Results are viewable and manageable via the Web UI

---

## 2. Prerequisites

### Required Accounts & Services

| Service | Purpose | Required Plan |
|---|---|---|
| Cloudflare | Workers, D1, R2, Queues, Workflows | Workers Paid ($5/mo+) |
| Cloudflare Access | Authentication (SSO) | Zero Trust Free tier is sufficient |
| Google AI (Gemini) | Transcription, summarization, analysis | API key required |

### Local Environment

| Tool | Version | Installation |
|---|---|---|
| Node.js | 20+ | `brew install node` |
| Bun | 1.0+ | `curl -fsSL https://bun.sh/install \| bash` |
| Wrangler | 3.x | `npm install -g wrangler` |
| ffmpeg | Latest | `brew install ffmpeg` (used by importer for audio conversion) |

---

## 3. Cloudflare Environment Setup

### 3.1 Wrangler Login

```bash
wrangler login
```

A browser window will open -- authenticate with your Cloudflare account.

### 3.2 Create D1 Database

```bash
wrangler d1 create voice-trunk-db
```

Copy the output `database_id` and update `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "voice-trunk-db"
database_id = "paste-your-database-id-here"
```

### 3.3 Run D1 Migrations

```bash
# Local (development)
wrangler d1 migrations apply voice-trunk-db --local

# Remote (production)
wrangler d1 migrations apply voice-trunk-db --remote
```

This creates 12 tables: orgs, users, devices, workshops, workshop_drafts, import_batches, recordings, recording_chunks, processing_runs, artifacts, gemini_semaphore, and audit_logs.

### 3.4 Seed Initial Data

Insert seed data for local development:

```bash
# Insert seed data into local dev DB
wrangler d1 execute voice-trunk-db --local --command "
INSERT OR IGNORE INTO orgs (id, name, retentionDays) VALUES ('org-seed000001', 'Demo Organization', 365);
INSERT OR IGNORE INTO users (id, orgId, accessSub, email, displayName, role) VALUES ('usr-seedadmin01', 'org-seed000001', 'cf-access-admin-sub-001', 'admin@example.com', 'Admin User', 'admin');
INSERT OR IGNORE INTO devices (id, orgId, label, expectedIdentifierFileName) VALUES ('dev-seeddevice1', 'org-seed000001', 'Table-1', 'RECORDER_ID.json');
INSERT OR IGNORE INTO devices (id, orgId, label, expectedIdentifierFileName) VALUES ('dev-seeddevice2', 'org-seed000001', 'Table-2', 'RECORDER_ID.json');
INSERT OR IGNORE INTO devices (id, orgId, label, expectedIdentifierFileName) VALUES ('dev-seeddevice3', 'org-seed000001', 'Table-3', 'RECORDER_ID.json');
"
```

For production, change `--local` to `--remote` and insert your actual organization and user information.

### 3.5 Create R2 Buckets

```bash
wrangler r2 bucket create r2-raw-audio
wrangler r2 bucket create r2-artifacts
```

### 3.6 Configure R2 Event Notification

Set up a notification so that when audio is uploaded to R2, a message is sent to the Queue:

```bash
wrangler r2 bucket notification create r2-raw-audio \
  --event-type object-create \
  --queue recording-upload-queue
```

### 3.7 Create Queue

```bash
wrangler queues create recording-upload-queue
```

### 3.8 Create R2 API Token (for presigned URLs)

In the Cloudflare dashboard, go to R2 > "Manage API Tokens" > "Create API Token":

- **Token name**: voice-trunk-r2
- **Permissions**: Object Read & Write
- **Target buckets**: r2-raw-audio, r2-artifacts

Note the **Access Key ID** and **Secret Access Key** displayed after creation.

### 3.9 Set Secrets

```bash
# Gemini API key
wrangler secret put GEMINI_API_KEY
# → Enter your Gemini API key at the prompt

# Cloudflare Access settings
wrangler secret put CF_ACCESS_TEAM_DOMAIN
# → your-team.cloudflareaccess.com

wrangler secret put CF_ACCESS_AUD
# → The Audience Tag from your Access Application

# R2 presigned URL credentials
wrangler secret put R2_ACCOUNT_ID
# → Your Cloudflare Account ID from the dashboard

wrangler secret put R2_ACCESS_KEY_ID
# → The Access Key ID created in step 3.8

wrangler secret put R2_SECRET_ACCESS_KEY
# → The Secret Access Key created in step 3.8
```

### 3.10 Configure Cloudflare Access

In the Cloudflare Zero Trust dashboard:

1. **Access > Applications > Add an application**
2. Select **Self-hosted**
3. Application name: `VoiceTrunk`
4. Domain: Your deployed Workers domain
5. **Policy**: Allow access by your organization's email domain
6. After setup, copy the **Application Audience (AUD) Tag** (already used in 3.9)

**Service Token** (for the importer):

1. **Access > Service Auth > Service Tokens > Create Service Token**
2. Note the Client ID and Client Secret (used in the importer's config.json)

---

## 4. Local Development Environment

### 4.1 Install Dependencies

```bash
cd /path/to/voice-trunk
bun install
```

### 4.2 Development Environment Variables

Edit `.dev.vars` (a template already exists):

```
CF_ACCESS_TEAM_DOMAIN=your-team.cloudflareaccess.com
CF_ACCESS_AUD=your-access-aud-tag
GEMINI_API_KEY=your-gemini-api-key
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
```

### 4.3 Local DB Migration

```bash
wrangler d1 migrations apply voice-trunk-db --local
```

### 4.4 Start Development Server

```bash
bun run dev
```

Open `http://localhost:5173` in your browser to view the Web UI.

> **Note**: In local development there is no Cloudflare Access authentication, so the API cannot be accessed directly. You will need to bypass authentication during development.

### 4.5 Run Tests

```bash
bun run test        # Run all tests
bun run test:watch  # Watch mode
```

### 4.6 Build Verification

```bash
bun run build
```

---

## 5. Production Deploy

### 5.1 Build + Deploy

```bash
bun run build
wrangler deploy
```

### 5.2 Post-Deploy Verification

```bash
# Check that the Worker is running
curl https://voice-trunk.<your-subdomain>.workers.dev/

# Check that D1 tables exist
wrangler d1 execute voice-trunk-db --remote --command "SELECT name FROM sqlite_master WHERE type='table'"
```

---

## 6. Importer (Import Tool) Setup

The Importer is a CLI tool that runs on a Mac. It detects USB recorder connections and automatically imports and uploads audio files.

### 6.1 Installation

```bash
cd /path/to/voice-trunk/importer
bun install
```

### 6.2 Install ffmpeg

Required for audio conversion and splitting:

```bash
brew install ffmpeg
```

Verify:

```bash
ffmpeg -version
```

### 6.3 Create Config File

The importer configuration is stored at `~/Library/Application Support/voice-trunk/config.json`.

It is automatically created on first run, but you can also create it manually:

```bash
mkdir -p ~/Library/Application\ Support/voice-trunk
cat > ~/Library/Application\ Support/voice-trunk/config.json << 'EOF'
{
  "maxStorageGB": 50,
  "serverUrl": "https://voice-trunk.<your-subdomain>.workers.dev",
  "authMode": "service_token",
  "clientId": "Your Service Token Client ID",
  "clientSecret": "Your Service Token Client Secret"
}
EOF
```

| Setting | Description | Default |
|---|---|---|
| `maxStorageGB` | Local inbox storage limit (GB) | 50 |
| `serverUrl` | Server URL | `http://localhost:8787` |
| `authMode` | Authentication mode (`service_token` or `user`) | `service_token` |
| `clientId` | Cloudflare Access Service Token Client ID | - |
| `clientSecret` | Cloudflare Access Service Token Client Secret | - |

### 6.4 Importer Commands

```bash
# Watch for recorder connections (primary usage)
bun run importer/src/index.ts watch

# Manually upload files that haven't been uploaded yet
bun run importer/src/index.ts upload

# Show current status
bun run importer/src/index.ts status

# Delete completed batches from local storage
bun run importer/src/index.ts clean

# Help
bun run importer/src/index.ts help
```

### 6.5 Watch Mode Behavior

When `watch` is started, the following happens automatically:

```
Poll /Volumes every 3 seconds
    ↓
Detect new mount (USB recorder connected)
    ↓
Check if RECORDER_ID.json exists
    ↓ If present
Scan for audio files (.wav, .mp3, .wma, .m4a, .flac, .ogg)
    ↓
Copy files to Inbox (computing SHA-256 during copy)
    ↓
Convert unsupported formats (e.g., WMA) to MP3 via ffmpeg
    ↓
Batch deduplication check with server (preflight-batch API)
    ↓
Obtain presigned URLs for new files only, upload directly to R2
    ↓
Upload complete → server-side processing starts automatically
```

### 6.6 Auto-Start with launchd (Daemonize)

To automatically start watch mode on Mac login:

```bash
# Create log directory
mkdir -p ~/Library/Logs/voice-trunk

# Copy the plist (verify paths are correct)
cp importer/com.voice-trunk.importer.plist ~/Library/LaunchAgents/

# Verify/edit paths in the plist
# Ensure the bun path and index.ts path in ProgramArguments are correct
open ~/Library/LaunchAgents/com.voice-trunk.importer.plist

# Register + start
launchctl load ~/Library/LaunchAgents/com.voice-trunk.importer.plist

# Check status
launchctl list | grep voice-trunk

# To stop
launchctl unload ~/Library/LaunchAgents/com.voice-trunk.importer.plist
```

### 6.7 Local Inbox Location

```
~/Library/Application Support/voice-trunk/
├── inbox/              # Imported audio files
│   └── {batchId}/
│       └── {deviceId}/
│           └── VOICE001.WAV
├── state.json          # Batch/file state management
└── config.json         # Configuration
```

- Copying stops when storage reaches `maxStorageGB` (default 50GB)
- Use `voice-trunk-import clean` to delete completed batches

---

## 6b. Desktop App (Recommended)

As an alternative to the CLI Importer, you can use the GUI desktop app. It is suitable for non-developer staff.

### Additional Prerequisites

| Tool | Version | Installation |
|---|---|---|
| Rust | 1.80+ | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Xcode CLT | - | `xcode-select --install` |

### Build

```bash
cd desktop
npm install
npm run tauri build
```

Copy the output `.app` bundle to `/Applications` and launch it.

### Initial Configuration

1. Launch the app > open "Settings" from the sidebar
2. Enter the server URL, Client ID, and Client Secret
3. Click "Connection Test" to verify connectivity
4. Confirm the ffmpeg path (auto-detected if `brew install ffmpeg` has been run)

### Feature Overview

| Feature | Description |
|---|---|
| Auto USB detection | Monitors `/Volumes` via FSEvents, detects RECORDER_ID.json |
| Import | File scan > hash > convert > upload |
| Manual upload | Select audio files via file picker dialog and upload |
| Batch management | View past import history and per-file status |
| System tray | Stays resident in the menu bar; click to show window |

See [desktop/README.md](../desktop/README.md) for full details.

---

## 7. Recorder Preparation

Place an identifier file in the root directory of each voice recorder.

### 7.1 Create RECORDER_ID.json

Connect the recorder via USB and create the following file at `/Volumes/<recorder-name>/`:

```bash
# Example: recorder for Table-1
cat > /Volumes/IC_RECORDER/RECORDER_ID.json << 'EOF'
{
  "deviceId": "dev-seeddevice1",
  "label": "Table-1",
  "orgIdHint": "org-seed000001",
  "notes": "Fixed to Table 1"
}
EOF
```

| Field | Required | Description |
|---|---|---|
| `deviceId` | **Required** | ID registered in the server's `devices` table |
| `label` | **Required** | Human-readable label (e.g., table number) |
| `orgIdHint` | Optional | Organization ID hint (for future use) |
| `notes` | Optional | Notes |

### 7.2 Device Registration

The `deviceId` in RECORDER_ID.json must be pre-registered in the server's `devices` table.

To insert directly into D1:

```bash
wrangler d1 execute voice-trunk-db --remote --command "
INSERT INTO devices (id, orgId, label, expectedIdentifierFileName)
VALUES ('dev-table1-001', 'org-yourorg', 'Table-1', 'RECORDER_ID.json');
"
```

In the future, devices can also be registered via the Web UI admin page (`/admin/devices`).

---

## 8. Daily Operation Flow

### Workshop Day

1. **Before**: Verify that each recorder has a RECORDER_ID.json file
2. **Recording**: Place recorders at each table and start recording
3. **After the session**: Connect recorders to the Mac via USB
4. **Auto-import**: The importer (in watch mode) automatically detects, copies, and uploads
5. **Monitoring**: Check progress in terminal logs

```
[importer] New mount detected: /Volumes/IC_RECORDER
[importer] Device: dev-seeddevice1 (Table-1)
[importer] Found 5 audio file(s).
[importer] Copying VOICE001.WAV (45.2 MB)...
[importer] Converting VOICE001.WAV -> MP3...
[importer] Checking 5 file(s) with server...
[importer] 2 file(s) already uploaded, skipping.
[importer] Uploading 3 new file(s)...
[importer] Uploaded VOICE003.WAV
[importer] Uploaded VOICE004.WAV
[importer] Uploaded VOICE005.WAV
[importer] Batch batch-20260215143022-a1b2c3 status: COMPLETED
```

### Multiple Recorders

1. Connect the first recorder -- auto-import begins
2. Wait for completion (or until logs indicate it's waiting), then connect the second recorder
3. It is detected automatically in the same manner
4. After all recorders are done, check batch status in the Web UI

### Post-Upload Processing

After upload completes, the server automatically runs the following steps (takes several minutes per file):

1. `load_metadata` -- Load metadata from DB
2. `ensure_audio_access` -- Verify access to the audio file in R2
3. `maybe_split_audio` -- Split long audio into chunks (in Phase 1, splitting is done locally)
4. `transcribe_chunks` -- Transcribe via Gemini API
5. `merge_transcripts` -- Merge transcription results across chunks
6. `summarize` -- Generate summaries (short/long/key points/decisions/open items)
7. `claims_extract` -- Extract claims (with stance: agree/disagree/undecided/hearsay)
8. `grouping` -- Auto-group recordings into the same workshop
9. `index_for_search` -- Build full-text search index
10. `notify` -- Completion notification (logging only in MVP)
11. `finalize` -- Final status update

### Handling Failures

- The recording detail page in the Web UI shows which step failed
- A "Reprocess" button allows re-running from the failed step
- If the status is `PARTIAL` (partially succeeded), the successful parts are preserved

---

## 9. Web UI Guide

### Page List

| URL | Page | Description |
|---|---|---|
| `/` | Dashboard | Recent batches, overview of in-progress/error recordings |
| `/workshops` | Workshop list | Filter by date and location |
| `/workshops/[id]` | Workshop detail | List of associated recordings |
| `/batches` | Batch list | List of import batches |
| `/batches/[id]` | Batch detail | Per-device file list and progress |
| `/drafts` | Draft list | Auto-inferred workshop candidates |
| `/drafts/[id]` | Draft detail | Confirm/merge/discard operations |
| `/recordings/[id]` | Recording detail | Audio player, transcript, summary, claims, reprocess |
| `/admin/devices` | Device management | List of registered recorders |
| `/admin/workshops/new` | Create workshop | Manually create a workshop |
| `/admin/users` | User management | Manage users and permissions |

### Draft Confirmation Flow

The `grouping` step in the processing pipeline automatically groups recordings from the same batch into "workshop candidates (drafts)."

1. View the draft list at `/drafts`
2. Select a draft > enter title, date, and location, then click "Confirm"
3. Confirming promotes the draft to an official Workshop and sets `workshopId` on associated recordings
4. Unwanted drafts can be "Discarded"; drafts can also be "Merged" if needed

---

## 10. Troubleshooting

### Importer Issues

**"ffmpeg not found" is displayed**

```bash
brew install ffmpeg
```

**"Storage limit reached" is displayed**

```bash
# Delete completed batches
bun run importer/src/index.ts clean

# Or increase maxStorageGB in config.json
```

**Recorder is not detected**

- Verify it is mounted under `/Volumes`: `ls /Volumes`
- Verify RECORDER_ID.json exists at the recorder's root
- Verify the deviceId is registered in the server's devices table

**Upload fails**

- Verify `serverUrl` in config.json is correct
- Verify Service Token `clientId`/`clientSecret` are correct
- Check network connectivity
- Run `bun run importer/src/index.ts status` to check state
- Run `bun run importer/src/index.ts upload` to retry

### Server Issues

**Workflow fails**

```bash
# List workflow instances
wrangler workflows instances list recording-pipeline-workflow

# View details for a specific instance
wrangler workflows instances describe recording-pipeline-workflow <instance-id>
```

**Check D1 state**

```bash
# List recent recording statuses
wrangler d1 execute voice-trunk-db --remote --command "
SELECT id, originalFileName, status, updatedAt FROM recordings ORDER BY updatedAt DESC LIMIT 10
"

# List recent processing run statuses
wrangler d1 execute voice-trunk-db --remote --command "
SELECT id, recordingId, status, failedStep, error FROM processing_runs ORDER BY startedAt DESC LIMIT 10
"
```

**Gemini API rate limits**

- Processing many files simultaneously may trigger 429 errors
- Reduce `GEMINI_MAX_CONCURRENT` in `wrangler.toml` (default: 5)
- Automatic retries with exponential backoff will recover, but too many concurrent requests cause overall slowdown

---

## 11. Architecture Details

### Directory Structure

```
voice-trunk/
├── migrations/                    # D1 migrations
│   └── 0001_initial_schema.sql    # 12-table schema
├── src/
│   ├── app.d.ts                   # SvelteKit type definitions
│   ├── app.html                   # HTML template
│   ├── app.css                    # Tailwind CSS + custom theme
│   ├── lib/
│   │   ├── api/client.ts          # Frontend API client
│   │   ├── components/            # Shared Svelte components
│   │   │   ├── AudioPlayer.svelte
│   │   │   ├── ClaimsPanel.svelte
│   │   │   ├── Pagination.svelte
│   │   │   ├── RecordingProgress.svelte
│   │   │   ├── StatusBadge.svelte
│   │   │   └── TranscriptViewer.svelte
│   │   ├── constants.ts           # Constants (error codes, step names, etc.)
│   │   ├── types/                 # Type definitions
│   │   │   ├── index.ts           # All shared types
│   │   │   └── env.ts             # Worker Env types
│   │   ├── utils/                 # Utilities
│   │   │   ├── id.ts              # ID generation
│   │   │   └── response.ts        # JSON response helpers
│   │   └── server/
│   │       ├── api/middleware.ts   # Auth & validation middleware
│   │       ├── auth/              # Authentication
│   │       │   ├── resolve-org.ts # orgId resolution
│   │       │   └── verify-jwt.ts  # JWT verification
│   │       ├── db/                # Database layer (12 files)
│   │       ├── r2/                # R2 operations
│   │       │   ├── keys.ts        # R2 key construction
│   │       │   └── presign.ts     # Presigned URL generation
│   │       ├── gemini/            # Gemini API
│   │       │   ├── client.ts      # API wrapper
│   │       │   └── prompts.ts     # Prompt templates
│   │       └── workflow/          # Workflow
│   │           ├── retry-config.ts
│   │           └── steps/         # 11 steps
│   ├── routes/
│   │   ├── +layout.svelte         # Shared layout (sidebar)
│   │   ├── +page.svelte           # Dashboard
│   │   ├── api/v1/                # API endpoints (15 routes)
│   │   ├── workshops/             # Workshop management
│   │   ├── batches/               # Batch management
│   │   ├── drafts/                # Draft management
│   │   ├── recordings/            # Recording detail
│   │   └── admin/                 # Admin pages
│   └── worker/
│       ├── index.ts               # Worker entry point
│       ├── queue-consumer.ts      # Queue handler
│       └── workflows/
│           └── recording-pipeline.ts # WorkflowEntrypoint
├── desktop/                       # Desktop app (Tauri v2)
│   ├── src-tauri/                 # Rust backend
│   │   ├── src/                   # Rust source (18 files)
│   │   └── Cargo.toml
│   ├── src/                       # SvelteKit frontend
│   │   ├── routes/                # Pages (status/upload/batches/settings)
│   │   └── lib/                   # Types, stores, components
│   └── package.json
├── importer/                      # CLI Importer (standalone package)
│   ├── package.json
│   ├── src/
│   │   ├── index.ts               # CLI entry point
│   │   ├── mount-detector.ts      # Mount detection
│   │   ├── identifier.ts          # RECORDER_ID.json parser
│   │   ├── file-scanner.ts        # Audio file scanning
│   │   ├── hasher.ts              # SHA-256 computation
│   │   ├── inbox.ts               # Inbox management
│   │   ├── audio-converter.ts     # ffmpeg conversion
│   │   ├── audio-splitter.ts      # ffmpeg splitting
│   │   ├── api-client.ts          # Server API client
│   │   ├── uploader.ts            # Upload processing
│   │   ├── state.ts               # State management
│   │   └── config.ts              # Configuration management
│   └── com.voice-trunk.importer.plist  # launchd config
├── tests/                         # Tests
├── wrangler.toml                  # Cloudflare configuration
├── svelte.config.js
├── vite.config.ts
└── package.json
```

### Recording Status Transitions

```
REGISTERED → UPLOADING → UPLOADED → PROCESSING → DONE
                                              → PARTIAL (partially succeeded)
                                              → ERROR
PARTIAL → PROCESSING (reprocess)
ERROR   → PROCESSING (reprocess)
DONE    → PROCESSING (reprocess)
```

### R2 Key Structure

```
org/{orgId}/recording/{recordingId}/raw/{fileName}         # Original audio
org/{orgId}/recording/{recordingId}/chunks/{idx}_{start}_{end}.mp3  # Chunks
org/{orgId}/recording/{recordingId}/runs/{runId}/transcript.json    # Transcript
org/{orgId}/recording/{recordingId}/runs/{runId}/summary.json      # Summary
org/{orgId}/recording/{recordingId}/runs/{runId}/claims.json       # Claims
```

### API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/devices` | List devices |
| POST | `/api/v1/recordings/preflight` | Single file deduplication check |
| POST | `/api/v1/recordings/preflight-batch` | Batch deduplication check (up to 200) |
| GET | `/api/v1/recordings` | List recordings |
| GET | `/api/v1/recordings/[id]` | Recording detail |
| POST | `/api/v1/recordings/[id]/presign` | Issue presigned URL |
| POST | `/api/v1/recordings/[id]/presign-part` | Multipart part URL |
| POST | `/api/v1/recordings/[id]/complete-multipart` | Complete multipart upload |
| POST | `/api/v1/recordings/[id]/complete` | Upload completion notification |
| POST | `/api/v1/recordings/[id]/reprocess` | Reprocess |
| GET | `/api/v1/workshops` | List workshops |
| POST | `/api/v1/workshops/[id]/export` | Export |
| GET | `/api/v1/import_batches` | List batches |
| GET | `/api/v1/workshop_drafts` | List drafts |
| POST | `/api/v1/workshop_drafts/[id]/confirm` | Confirm draft |

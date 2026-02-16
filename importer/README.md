# VoiceTrunk Importer

A Bun-based CLI tool for auto-importing voice recordings from USB IC recorders on macOS.

Monitors `/Volumes` for USB mounts, copies audio files to a local inbox, converts formats if needed via ffmpeg, and uploads to the server using presigned URLs.

> **Note**: The desktop app (`desktop/`) is the recommended replacement for non-developer users. It provides the same functionality with a graphical interface. The CLI importer will be deprecated in the future.

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Bun | 1.0+ | `curl -fsSL https://bun.sh/install \| bash` |
| ffmpeg | latest | `brew install ffmpeg` |

The VoiceTrunk server must be deployed (Cloudflare Workers) before the importer can upload files.

## Setup

```bash
cd importer
bun install
```

## Configuration

Configuration is stored at:

```
~/Library/Application Support/voice-trunk/config.json
```

| Field | Type | Default | Description |
|---|---|---|---|
| `maxStorageGB` | number | `50` | Maximum local inbox size in GB |
| `serverUrl` | string | `http://localhost:8787` | Server URL (Cloudflare Workers deployment) |
| `authMode` | string | `"service_token"` | Authentication mode |
| `clientId` | string | -- | Cloudflare Access Service Token Client ID |
| `clientSecret` | string | -- | Cloudflare Access Service Token Client Secret |

The config file is created automatically on first run with default values. Edit it manually to set your server URL and credentials.

## Commands

```
voice-trunk-import watch   - Watch /Volumes for new mounts, auto-import
voice-trunk-import upload  - Upload all pending files from inbox
voice-trunk-import status  - Show current state (batches, upload progress)
voice-trunk-import clean   - Remove completed batches from inbox
voice-trunk-import help    - Show this help message
```

Run directly with Bun:

```bash
bun run src/index.ts watch
```

Or via the package script:

```bash
bun run watch
```

## Watch Mode Flow

When running `voice-trunk-import watch`, the importer follows this pipeline:

1. **Poll `/Volumes`** -- checks for new USB mounts every 3 seconds, ignoring system volumes
2. **Detect mount** -- when a new volume appears, look for `RECORDER_ID.json` at the root
3. **Read `RECORDER_ID.json`** -- extract `deviceId` and `label` to identify the recorder
4. **Scan for audio files** -- recursively find all audio files on the volume (skipping hidden directories)
5. **Copy + hash** -- copy each file to the local inbox, computing SHA-256 during the copy
6. **Convert if needed** -- WMA files and large WAV files (>50 MB) are converted to MP3 via ffmpeg (mono, 16 kHz, 64 kbps)
7. **Preflight batch** -- send file metadata and hashes to the server to check for duplicates; the server returns recording IDs and upload IDs for new files
8. **Upload new files** -- upload via presigned URLs (single PUT for files <100 MB, multipart for larger files with 10 MB parts and up to 4 concurrent uploads)
9. **Server processing** -- the server automatically triggers the recording pipeline (transcription, summarization, etc.)

## Supported Audio Formats

`.wav`, `.mp3`, `.wma`, `.m4a`, `.flac`, `.ogg`

## Auto-Start with launchd

To run the importer as a background daemon:

1. Edit `com.voice-trunk.importer.plist` to match your paths (Bun binary path, project path)
2. Copy the plist to the LaunchAgents directory:

```bash
cp com.voice-trunk.importer.plist ~/Library/LaunchAgents/
```

3. Load it:

```bash
launchctl load ~/Library/LaunchAgents/com.voice-trunk.importer.plist
```

4. To stop:

```bash
launchctl unload ~/Library/LaunchAgents/com.voice-trunk.importer.plist
```

Logs are written to `~/Library/Logs/voice-trunk/importer.log` and `importer-error.log`.

## Local Data

```
~/Library/Application Support/voice-trunk/
├── config.json    # Configuration (server URL, credentials, storage limit)
├── state.json     # Batch and file state (upload progress, recording IDs)
└── inbox/         # Temporary audio file staging area
    └── <batchId>/
        └── <deviceId>/
            └── *.mp3, *.wav, ...
```

### state.json

Tracks all import batches and per-file upload status. Each batch has a status (`OPEN`, `UPLOADING`, `COMPLETED`, `PARTIAL_ERROR`) and files are keyed by their SHA-256 hash.

The state.json format is compatible with the desktop app (`desktop/`), so migration between the two is possible.

## Module Overview

| Module | Description |
|---|---|
| `index.ts` | CLI entry point, command routing, main watch loop |
| `mount-detector.ts` | Polls `/Volumes` for new USB mounts (async generator) |
| `identifier.ts` | Reads `RECORDER_ID.json` from mount root |
| `file-scanner.ts` | Recursively scans for audio files by extension |
| `hasher.ts` | SHA-256 hash computation during file copy |
| `inbox.ts` | Local inbox directory management, storage limit checks, cleanup |
| `audio-converter.ts` | ffmpeg-based WMA/large-WAV to MP3 conversion |
| `audio-splitter.ts` | Splits long audio files at silence boundaries via ffmpeg |
| `api-client.ts` | Server API client (preflight, presign, multipart, status) |
| `uploader.ts` | Presigned URL upload (single and multipart with resume) |
| `state.ts` | Batch/file state persistence (state.json read/write) |
| `config.ts` | Configuration file management (config.json read/write) |

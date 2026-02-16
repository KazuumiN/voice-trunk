# VoiceTrunk

> [!CAUTION]
> This project is currently incomplete and not fully operational.

![voicetruck-hero](https://github.com/user-attachments/assets/78ab7685-c17d-4fd0-b7c9-d42b0c77b893)

A system for ingesting workshop voice recordings from USB recorders, automatically uploading them to the cloud, and processing them through an AI pipeline (transcription, summarization, claim extraction). Designed for civic workshop recording management.

[Japanese / 日本語](./README-ja.md)

## Architecture

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

## Components

### 1. Server (`src/`)

SvelteKit application deployed on Cloudflare Workers. Provides a web UI for browsing recordings, transcripts, summaries, and claims; a REST API consumed by both the desktop app and CLI importer; and a background processing pipeline (Cloudflare Workflows) that orchestrates transcription, summarization, and claim extraction via the Gemini API.

### 2. Desktop App (`desktop/`)

Tauri v2 GUI application for importing recordings from USB voice recorders. Recommended for non-developer staff. Features automatic USB detection, one-click import, manual upload, batch management, and system tray integration. See [desktop/README.md](./desktop/README.md) for details.

### 3. CLI Importer (`importer/`)

Bun-based command-line tool as a developer-oriented alternative to the desktop app. Watches for USB recorder connections, copies and deduplicates audio files, converts formats as needed, and uploads to R2. Can be daemonized via launchd. See [importer/README.md](./importer/README.md) for details.

## Quick Start

See [docs/quickstart.md](./docs/quickstart.md) for the full setup walkthrough.

Minimal commands to get started:

```bash
# Server (local development)
bun install
bun run dev

# Desktop app
cd desktop && npm install && npm run tauri dev
```

## Directory Structure

```
voice-trunk/
├── src/                # Server: SvelteKit app (Web UI + API + pipeline)
├── desktop/            # Desktop app: Tauri v2 GUI importer
├── importer/           # CLI importer: Bun-based alternative
├── docs/               # Documentation (English + Japanese)
├── migrations/         # D1 (SQLite) migration files
├── tests/              # Unit tests (Vitest)
├── wrangler.toml       # Cloudflare Workers configuration
└── package.json
```

## Tech Stack

| Layer | Technology |
|---|---|
| Web framework | SvelteKit (Svelte 5 runes) |
| Styling | Tailwind CSS v4 |
| Cloud platform | Cloudflare Workers, D1, R2, Queues, Workflows |
| AI processing | Google Gemini API |
| Desktop app | Tauri v2, Rust |
| CLI importer | Bun (TypeScript) |
| Testing | Vitest |

## Documentation

| Document | Description |
|---|---|
| [docs/quickstart.md](./docs/quickstart.md) | Quick start guide (shortest path to running) |
| [docs/setup-guide.md](./docs/setup-guide.md) | Comprehensive setup and operations guide |
| [desktop/README.md](./desktop/README.md) | Desktop app documentation |
| [importer/README.md](./importer/README.md) | CLI importer documentation |

Japanese versions are available as `-ja` variants (e.g., `docs/quickstart-ja.md`, `docs/setup-guide-ja.md`).

## License

Private. All rights reserved.

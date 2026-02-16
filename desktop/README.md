# VoiceTrunk Desktop

A desktop app (Tauri v2 + SvelteKit) for auto-importing and uploading voice recordings from IC recorders.

This is the GUI replacement for the existing CLI importer (`importer/`). It provides USB recorder detection, auto-import, manual upload, batch management, and a settings screen.

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 20+ | `brew install node` |
| Rust | 1.80+ | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| ffmpeg | latest | `brew install ffmpeg` (used for audio conversion) |

Xcode Command Line Tools are also required:

```bash
xcode-select --install
```

## Setup

```bash
cd desktop
npm install
```

## Development

```bash
npm run tauri dev
```

This starts the SvelteKit dev server (port 1420) and the Rust backend simultaneously. Hot reload is supported.

## Build

```bash
npm run tauri build
```

Output:
- `.app` bundle: `src-tauri/target/release/bundle/macos/VoiceTrunk.app`
- `.dmg` installer: `src-tauri/target/release/bundle/dmg/` (code signing required)

## Initial Configuration After Launch

1. Launch the app and open "Settings" from the sidebar
2. **Server URL**: Enter the Cloudflare Workers deployment URL (e.g., `https://voice-trunk.xxx.workers.dev`)
3. **Client ID / Client Secret**: Enter the Cloudflare Access Service Token credentials
4. Click "Connection Test" to verify connectivity
5. Confirm the ffmpeg path (usually just `ffmpeg` is fine)

## Usage

### Auto-Import from USB Recorder

1. The app runs as a system tray resident (menu bar icon)
2. Connect a USB recorder that has a `RECORDER_ID.json` file on it
3. The device is automatically detected and shown on the Status page
4. Click the "Import" button (or enable auto-import in settings)
5. Progress is displayed in real time

### Manual Upload

1. Open "Upload" from the sidebar
2. Click "Select Files" to choose local audio files
3. SHA-256 hash is computed, duplicates are checked on the server, then files are uploaded

### Batch Management

1. Open "Batches" from the sidebar
2. View the list of past import batches
3. Check individual file status within each batch
4. Click "Clean Completed" to free local inbox disk space

## Directory Structure

```
desktop/
├── src-tauri/               # Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json      # Tauri configuration
│   ├── capabilities/        # Permission definitions
│   ├── icons/               # App icons
│   └── src/
│       ├── main.rs          # Entry point
│       ├── lib.rs           # Module declarations & plugin registration
│       ├── config.rs        # AppConfig read/write
│       ├── state.rs         # Batch/file state management + JSON persistence
│       ├── error.rs         # AppError type
│       ├── events.rs        # Event payload types
│       ├── volume_watcher.rs # /Volumes monitoring (FSEvents)
│       ├── tray.rs          # System tray
│       └── commands/        # Tauri commands
│           ├── config.rs    # Settings CRUD
│           ├── volumes.rs   # Device detection & identification
│           ├── scanner.rs   # File scanning (walkdir)
│           ├── hasher.rs    # SHA-256 hashing
│           ├── converter.rs # ffmpeg conversion
│           ├── api_client.rs # Server API communication (reqwest)
│           ├── uploader.rs  # Presigned URL upload
│           ├── importer.rs  # Import orchestration
│           └── batches.rs   # Batch management
├── src/                     # SvelteKit frontend
│   ├── app.html / app.css
│   ├── routes/
│   │   ├── +layout.svelte   # Sidebar + connection status
│   │   ├── status/          # Main dashboard
│   │   ├── upload/          # Manual upload
│   │   ├── batches/         # Batch list
│   │   └── settings/        # Settings screen
│   └── lib/
│       ├── tauri.ts         # invoke() wrapper + event listeners
│       ├── types.ts         # TypeScript type definitions
│       ├── stores.svelte.ts # Svelte 5 reactive stores
│       └── components/      # UI components
├── package.json
├── svelte.config.js         # adapter-static (SSR off)
└── vite.config.ts
```

## Tech Stack

- **Tauri v2** -- Rust backend + Web frontend
- **SvelteKit** -- adapter-static, SSR off, Svelte 5 runes
- **Tailwind CSS v4** -- UI styling
- **Rust crates**: reqwest (HTTP), sha2 (hashing), notify (FSEvents), walkdir (file scanning), tokio (async)
- **Tauri plugins**: dialog, notification, shell, store

## Data Storage

```
~/Library/Application Support/com.liquitous.voice-trunk/
├── config.json    # App settings
├── state.json     # Batch/file state (compatible with importer/state.json)
└── inbox/         # Temporary audio file staging area
```

Auth credentials (Client ID / Secret) are stored in the OS Keychain via `tauri-plugin-store`.

## Relationship to CLI Importer

- `importer/` is a CLI tool (Bun-based) that runs as a `launchd` daemon
- `desktop/` is its GUI counterpart, using the same server API
- `state.json` uses a compatible format, so migration from the importer is possible
- The CLI importer will be deprecated in the future

## Troubleshooting

### Build error: Rust not found

Run the following, or add it to your shell profile (`.zshrc`):

```bash
source ~/.cargo/env
```

### ffmpeg not detected

Specify the ffmpeg path explicitly on the Settings page (e.g., `/opt/homebrew/bin/ffmpeg`).

### DMG build fails

The `.app` bundle should still be generated successfully. DMG generation requires code signing. During development, use the `.app` directly.

### Cannot connect to server

1. Verify the server URL is correct
2. Verify the Service Token Client ID / Secret are valid
3. Verify the Service Token is allowed in the Cloudflare Access configuration

# VoiceTrunk Importer

macOS 上で USB IC レコーダーから音声ファイルを自動取り込みする Bun ベースの CLI ツールです。

`/Volumes` を監視して USB マウントを検知し、音声ファイルをローカル inbox にコピー、必要に応じて ffmpeg で変換した後、プリサイン URL を使ってサーバーにアップロードします。

> **注意**: デスクトップアプリ（`desktop/`）が非開発者向けの推奨ツールです。同じ機能を GUI で提供します。CLI importer は将来的に deprecate 予定です。

## 前提条件

| ツール | バージョン | インストール |
|---|---|---|
| Bun | 1.0+ | `curl -fsSL https://bun.sh/install \| bash` |
| ffmpeg | 最新 | `brew install ffmpeg` |

importer がファイルをアップロードするには、VoiceTrunk サーバー（Cloudflare Workers）が事前にデプロイされている必要があります。

## セットアップ

```bash
cd importer
bun install
```

## 設定

設定ファイルの保存先:

```
~/Library/Application Support/voice-trunk/config.json
```

| フィールド | 型 | デフォルト | 説明 |
|---|---|---|---|
| `maxStorageGB` | number | `50` | ローカル inbox の最大サイズ（GB） |
| `serverUrl` | string | `http://localhost:8787` | サーバー URL（Cloudflare Workers のデプロイ先） |
| `authMode` | string | `"service_token"` | 認証モード |
| `clientId` | string | -- | Cloudflare Access Service Token の Client ID |
| `clientSecret` | string | -- | Cloudflare Access Service Token の Client Secret |

初回実行時にデフォルト値で config ファイルが自動生成されます。サーバー URL と認証情報は手動で編集してください。

## コマンド

```
voice-trunk-import watch   - /Volumes を監視して新しいマウントを自動インポート
voice-trunk-import upload  - inbox 内の未アップロードファイルをすべてアップロード
voice-trunk-import status  - 現在の状態を表示（バッチ、アップロード進捗）
voice-trunk-import clean   - 完了済みバッチを inbox から削除
voice-trunk-import help    - ヘルプメッセージを表示
```

Bun で直接実行:

```bash
bun run src/index.ts watch
```

または package script 経由:

```bash
bun run watch
```

## Watch モードの処理フロー

`voice-trunk-import watch` を実行すると、以下のパイプラインで処理されます:

1. **`/Volumes` をポーリング** -- 3 秒ごとに新しい USB マウントをチェック（システムボリュームは除外）
2. **マウント検知** -- 新しいボリュームが現れたら、ルートの `RECORDER_ID.json` を確認
3. **`RECORDER_ID.json` 読み取り** -- `deviceId` と `label` を抽出してレコーダーを識別
4. **音声ファイルスキャン** -- ボリューム内の音声ファイルを再帰的に検索（隠しディレクトリはスキップ）
5. **コピー + ハッシュ** -- 各ファイルをローカル inbox にコピーし、コピー中に SHA-256 を計算
6. **必要に応じて変換** -- WMA ファイルおよび大きな WAV ファイル（50 MB 超）を ffmpeg で MP3 に変換（モノラル、16 kHz、64 kbps）
7. **プリフライトバッチ** -- ファイルのメタデータとハッシュをサーバーに送信して重複チェック。サーバーは新規ファイルの recording ID と upload ID を返す
8. **新規ファイルのアップロード** -- プリサイン URL 経由でアップロード（100 MB 未満は単一 PUT、それ以上はマルチパート: 10 MB パート、最大 4 並列アップロード）
9. **サーバー側処理** -- サーバーが自動的に録音パイプライン（文字起こし、要約等）を開始

## 対応音声フォーマット

`.wav`, `.mp3`, `.wma`, `.m4a`, `.flac`, `.ogg`

## launchd で自動起動

importer をバックグラウンドデーモンとして実行するには:

1. `com.voice-trunk.importer.plist` のパスを環境に合わせて編集（Bun バイナリのパス、プロジェクトのパス）
2. plist を LaunchAgents ディレクトリにコピー:

```bash
cp com.voice-trunk.importer.plist ~/Library/LaunchAgents/
```

3. ロード:

```bash
launchctl load ~/Library/LaunchAgents/com.voice-trunk.importer.plist
```

4. 停止する場合:

```bash
launchctl unload ~/Library/LaunchAgents/com.voice-trunk.importer.plist
```

ログは `~/Library/Logs/voice-trunk/importer.log` と `importer-error.log` に出力されます。

## ローカルデータ

```
~/Library/Application Support/voice-trunk/
├── config.json    # 設定（サーバー URL、認証情報、ストレージ上限）
├── state.json     # バッチ・ファイル状態（アップロード進捗、recording ID）
└── inbox/         # 一時的な音声ファイル置き場
    └── <batchId>/
        └── <deviceId>/
            └── *.mp3, *.wav, ...
```

### state.json

すべてのインポートバッチとファイル単位のアップロード状態を追跡します。各バッチにはステータス（`OPEN`, `UPLOADING`, `COMPLETED`, `PARTIAL_ERROR`）があり、ファイルは SHA-256 ハッシュをキーとして管理されます。

state.json のフォーマットはデスクトップアプリ（`desktop/`）と互換性があるため、両者間の移行が可能です。

## モジュール一覧

| モジュール | 説明 |
|---|---|
| `index.ts` | CLI エントリーポイント、コマンドルーティング、メイン watch ループ |
| `mount-detector.ts` | `/Volumes` を定期ポーリングして USB マウントを検知（async generator） |
| `identifier.ts` | マウントルートから `RECORDER_ID.json` を読み取り |
| `file-scanner.ts` | 拡張子ベースで音声ファイルを再帰スキャン |
| `hasher.ts` | ファイルコピー時の SHA-256 ハッシュ計算 |
| `inbox.ts` | ローカル inbox ディレクトリ管理、ストレージ上限チェック、クリーンアップ |
| `audio-converter.ts` | ffmpeg による WMA / 大容量 WAV から MP3 への変換 |
| `audio-splitter.ts` | ffmpeg で長時間音声を無音区間で分割 |
| `api-client.ts` | サーバー API クライアント（preflight、presign、multipart、status） |
| `uploader.ts` | プリサイン URL アップロード（単一・マルチパート、レジューム対応） |
| `state.ts` | バッチ・ファイル状態の永続化（state.json 読み書き） |
| `config.ts` | 設定ファイル管理（config.json 読み書き） |

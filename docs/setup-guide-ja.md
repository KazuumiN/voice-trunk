# VoiceTrunk セットアップ・運用ガイド

## 目次

1. [システム概要](#1-システム概要)
2. [前提条件](#2-前提条件)
3. [Cloudflare 環境構築](#3-cloudflare-環境構築)
4. [ローカル開発環境](#4-ローカル開発環境)
5. [本番デプロイ](#5-本番デプロイ)
6. [Importer（取り込みツール）セットアップ](#6-importer取り込みツールセットアップ)
6b. [デスクトップアプリ（推奨）](#6b-デスクトップアプリ推奨)
7. [レコーダー準備](#7-レコーダー準備)
8. [日常運用フロー](#8-日常運用フロー)
9. [Web UI の使い方](#9-web-ui-の使い方)
10. [トラブルシューティング](#10-トラブルシューティング)
11. [アーキテクチャ詳細](#11-アーキテクチャ詳細)

---

## 1. システム概要

「VoiceTrunk」は、市民ワークショップの録音ファイルを**自動で取り込み→クラウドにアップロード→文字起こし・要約・分析**するシステムです。

```
┌──────────────────────┐     ┌────────────────────────────────────────────┐
│ スタッフの Mac        │     │ Cloudflare                                  │
│                      │     │                                            │
│  レコーダー USB       │     │  ┌─────────┐  ┌────┐  ┌──────────────┐   │
│    ↓                 │     │  │ SvelteKit│  │ D1 │  │ R2 (音声)     │   │
│  デスクトップアプリ    │────→│  │ Web+API  │  │ DB │  │ R2 (成果物)   │   │
│  (Tauri v2, 推奨)    │     │  └─────────┘  └────┘  └──────────────┘   │
│  または               │     │       ↑                      ↓            │
│  Importer CLI        │     │  ┌─────────┐  ┌──────────────────────┐   │
│  (Bun, 開発者向け)    │     │  │ Queue   │←─│ R2 Event Notification │   │
│                      │     │  └────┬────┘  └──────────────────────┘   │
│                      │     │       ↓                                   │
│                      │     │  ┌──────────────────────────────────┐    │
│                      │     │  │ Workflow (11ステップ処理パイプライン) │    │
│                      │     │  │ → 文字起こし → 要約 → 主張抽出     │    │
│                      │     │  └──────────────────────────────────┘    │
│                      │     │       ↓                                   │
│                      │     │  Gemini API (外部)                        │
└──────────────────────┘     └────────────────────────────────────────────┘
```

### 処理の流れ

1. スタッフがレコーダーを Mac に USB 接続
2. Importer が自動で新しい録音ファイルを検出
3. SHA-256 で重複チェック → 新規ファイルのみコピー＋アップロード
4. R2 にアップロード完了 → 自動で処理パイプラインが起動
5. Gemini API で文字起こし → 要約 → 主張抽出 → 自動グルーピング
6. Web UI で結果を閲覧・管理

---

## 2. 前提条件

### 必要なアカウント・サービス

| サービス | 用途 | 必要なプラン |
|---|---|---|
| Cloudflare | Workers, D1, R2, Queues, Workflows | Workers Paid ($5/月〜) |
| Cloudflare Access | 認証（SSO） | Zero Trust Free で可 |
| Google AI (Gemini) | 文字起こし・要約・分析 | API キーが必要 |

### ローカル環境

| ツール | バージョン | インストール方法 |
|---|---|---|
| Node.js | 20+ | `brew install node` |
| Bun | 1.0+ | `curl -fsSL https://bun.sh/install \| bash` |
| Wrangler | 3.x | `npm install -g wrangler` |
| ffmpeg | 最新 | `brew install ffmpeg`（Importer で音声変換に使用） |

---

## 3. Cloudflare 環境構築

### 3.1 Wrangler ログイン

```bash
wrangler login
```

ブラウザが開くので、Cloudflare アカウントで認証してください。

### 3.2 D1 データベース作成

```bash
wrangler d1 create voice-trunk-db
```

出力される `database_id` をコピーし、`wrangler.toml` を更新:

```toml
[[d1_databases]]
binding = "DB"
database_name = "voice-trunk-db"
database_id = "ここにコピーした database_id を貼る"
```

### 3.3 D1 マイグレーション実行

```bash
# ローカル（開発用）
wrangler d1 migrations apply voice-trunk-db --local

# リモート（本番）
wrangler d1 migrations apply voice-trunk-db --remote
```

これで 12 テーブル（orgs, users, devices, workshops, workshop_drafts, import_batches, recordings, recording_chunks, processing_runs, artifacts, gemini_semaphore, audit_logs）が作成されます。

### 3.4 初期データ投入

開発用シードデータを投入:

```bash
# ローカル開発DB にシードデータ投入
wrangler d1 execute voice-trunk-db --local --command "
INSERT OR IGNORE INTO orgs (id, name, retentionDays) VALUES ('org-seed000001', 'Demo Organization', 365);
INSERT OR IGNORE INTO users (id, orgId, accessSub, email, displayName, role) VALUES ('usr-seedadmin01', 'org-seed000001', 'cf-access-admin-sub-001', 'admin@example.com', 'Admin User', 'admin');
INSERT OR IGNORE INTO devices (id, orgId, label, expectedIdentifierFileName) VALUES ('dev-seeddevice1', 'org-seed000001', 'Table-1', 'RECORDER_ID.json');
INSERT OR IGNORE INTO devices (id, orgId, label, expectedIdentifierFileName) VALUES ('dev-seeddevice2', 'org-seed000001', 'Table-2', 'RECORDER_ID.json');
INSERT OR IGNORE INTO devices (id, orgId, label, expectedIdentifierFileName) VALUES ('dev-seeddevice3', 'org-seed000001', 'Table-3', 'RECORDER_ID.json');
"
```

本番環境では `--remote` に変更し、実際の組織・ユーザー情報を投入してください。

### 3.5 R2 バケット作成

```bash
wrangler r2 bucket create r2-raw-audio
wrangler r2 bucket create r2-artifacts
```

### 3.6 R2 Event Notification 設定

R2 に音声がアップロードされたら Queue に通知する設定:

```bash
wrangler r2 bucket notification create r2-raw-audio \
  --event-type object-create \
  --queue recording-upload-queue
```

### 3.7 Queue 作成

```bash
wrangler queues create recording-upload-queue
```

### 3.8 R2 API トークン作成（presigned URL 用）

Cloudflare ダッシュボード → R2 → 「API トークンを管理」 → 「API トークンを作成」:

- **トークン名**: voice-trunk-r2
- **権限**: オブジェクトの読み取りと書き込み
- **対象バケット**: r2-raw-audio, r2-artifacts

作成後に表示される **Access Key ID** と **Secret Access Key** をメモしてください。

### 3.9 シークレット設定

```bash
# Gemini API キー
wrangler secret put GEMINI_API_KEY
# → プロンプトに Gemini API キーを入力

# Cloudflare Access 設定
wrangler secret put CF_ACCESS_TEAM_DOMAIN
# → your-team.cloudflareaccess.com

wrangler secret put CF_ACCESS_AUD
# → Access Application の Audience Tag

# R2 presigned URL 用
wrangler secret put R2_ACCOUNT_ID
# → Cloudflare ダッシュボードの Account ID

wrangler secret put R2_ACCESS_KEY_ID
# → 3.8 で作成した Access Key ID

wrangler secret put R2_SECRET_ACCESS_KEY
# → 3.8 で作成した Secret Access Key
```

### 3.10 Cloudflare Access 設定

Cloudflare Zero Trust ダッシュボードで:

1. **Access → Applications → Add an application**
2. **Self-hosted** を選択
3. アプリケーション名: `VoiceTrunk`
4. ドメイン: デプロイ先の Workers ドメイン
5. **Policy**: 組織のメールドメインでアクセス許可
6. 設定完了後、**Application Audience (AUD) Tag** をコピー（3.9 で使用済み）

**Service Token**（Importer 用）:

1. **Access → Service Auth → Service Tokens → Create Service Token**
2. Client ID と Client Secret をメモ（Importer の config.json に設定）

---

## 4. ローカル開発環境

### 4.1 依存パッケージインストール

```bash
cd /path/to/voice-trunk
bun install
```

### 4.2 開発用環境変数

`.dev.vars` を編集（既にテンプレートがあります）:

```
CF_ACCESS_TEAM_DOMAIN=your-team.cloudflareaccess.com
CF_ACCESS_AUD=your-access-aud-tag
GEMINI_API_KEY=your-gemini-api-key
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
```

### 4.3 ローカル DB マイグレーション

```bash
wrangler d1 migrations apply voice-trunk-db --local
```

### 4.4 開発サーバー起動

```bash
bun run dev
```

ブラウザで `http://localhost:5173` を開くと Web UI が表示されます。

> **注意**: ローカル開発では Cloudflare Access 認証がないため、API は直接アクセスできません。開発時は認証をバイパスする必要があります。

### 4.5 テスト実行

```bash
bun run test        # 全テスト実行
bun run test:watch  # ウォッチモード
```

### 4.6 ビルド確認

```bash
bun run build
```

---

## 5. 本番デプロイ

### 5.1 ビルド＋デプロイ

```bash
bun run build
wrangler deploy
```

### 5.2 デプロイ後の確認

```bash
# Worker が動いているか確認
curl https://voice-trunk.<your-subdomain>.workers.dev/

# D1 にテーブルがあるか確認
wrangler d1 execute voice-trunk-db --remote --command "SELECT name FROM sqlite_master WHERE type='table'"
```

---

## 6. Importer（取り込みツール）セットアップ

Importer は Mac 上で動作する CLI ツールです。レコーダーの USB 接続を検知して、自動で録音ファイルを取り込み・アップロードします。

### 6.1 インストール

```bash
cd /path/to/voice-trunk/importer
bun install
```

### 6.2 ffmpeg インストール

音声変換・分割に必要です:

```bash
brew install ffmpeg
```

確認:

```bash
ffmpeg -version
```

### 6.3 設定ファイル作成

Importer の設定は `~/Library/Application Support/voice-trunk/config.json` に保存されます。

初回起動時に自動作成されますが、手動で作成することもできます:

```bash
mkdir -p ~/Library/Application\ Support/voice-trunk
cat > ~/Library/Application\ Support/voice-trunk/config.json << 'EOF'
{
  "maxStorageGB": 50,
  "serverUrl": "https://voice-trunk.<your-subdomain>.workers.dev",
  "authMode": "service_token",
  "clientId": "ここに Service Token の Client ID",
  "clientSecret": "ここに Service Token の Client Secret"
}
EOF
```

| 設定項目 | 説明 | デフォルト |
|---|---|---|
| `maxStorageGB` | ローカル Inbox の容量上限（GB） | 50 |
| `serverUrl` | サーバーの URL | `http://localhost:8787` |
| `authMode` | 認証方式（`service_token` or `user`） | `service_token` |
| `clientId` | Cloudflare Access Service Token の Client ID | - |
| `clientSecret` | Cloudflare Access Service Token の Client Secret | - |

### 6.4 Importer コマンド一覧

```bash
# レコーダー接続の監視（メインの使い方）
bun run importer/src/index.ts watch

# 未アップロードファイルの手動アップロード
bun run importer/src/index.ts upload

# 現在の状態を表示
bun run importer/src/index.ts status

# 完了済みバッチをローカルから削除
bun run importer/src/index.ts clean

# ヘルプ
bun run importer/src/index.ts help
```

### 6.5 watch モードの動作

`watch` を起動すると、以下が自動で行われます:

```
/Volumes を3秒間隔でポーリング
    ↓
新しいマウント検知（USBレコーダー接続）
    ↓
RECORDER_ID.json があるか確認
    ↓ ある場合
音声ファイルをスキャン（.wav, .mp3, .wma, .m4a, .flac, .ogg）
    ↓
ファイルを Inbox にコピー（コピー中に SHA-256 を計算）
    ↓
WMA など非対応形式は ffmpeg で MP3 に変換
    ↓
サーバーに一括重複チェック（preflight-batch API）
    ↓
新規ファイルのみ presigned URL を取得して R2 に直接アップロード
    ↓
アップロード完了 → サーバー側で自動処理開始
```

### 6.6 launchd で自動起動（常駐化）

Mac ログイン時に自動で watch モードを起動する設定:

```bash
# ログディレクトリ作成
mkdir -p ~/Library/Logs/voice-trunk

# plist をコピー（パスが正しいか確認してください）
cp importer/com.voice-trunk.importer.plist ~/Library/LaunchAgents/

# plist 内のパスを確認・編集
# ProgramArguments の bun パスと index.ts パスが正しいことを確認
open ~/Library/LaunchAgents/com.voice-trunk.importer.plist

# 登録＋起動
launchctl load ~/Library/LaunchAgents/com.voice-trunk.importer.plist

# 状態確認
launchctl list | grep voice-trunk

# 停止したい場合
launchctl unload ~/Library/LaunchAgents/com.voice-trunk.importer.plist
```

### 6.7 ローカル Inbox の場所

```
~/Library/Application Support/voice-trunk/
├── inbox/              # 取り込んだ音声ファイル
│   └── {batchId}/
│       └── {deviceId}/
│           └── VOICE001.WAV
├── state.json          # バッチ・ファイルの状態管理
└── config.json         # 設定
```

- 容量が `maxStorageGB`（デフォルト 50GB）に達すると新規コピーを停止
- `voice-trunk-import clean` で完了済みバッチを削除

---

## 6b. デスクトップアプリ（推奨）

CLI Importer の代わりに、GUI のデスクトップアプリを使用できます。非開発者のスタッフにも提供可能です。

### 前提条件（追加）

| ツール | バージョン | インストール |
|---|---|---|
| Rust | 1.80+ | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Xcode CLT | - | `xcode-select --install` |

### ビルド

```bash
cd desktop
npm install
npm run tauri build
```

出力される `.app` バンドルを `/Applications` にコピーして起動してください。

### 初回設定

1. アプリ起動 → サイドバーの「設定」を開く
2. サーバーURL、Client ID、Client Secret を入力
3. 「接続テスト」で疎通確認
4. ffmpeg パスを確認（`brew install ffmpeg` 済みなら自動検出）

### 機能概要

| 機能 | 説明 |
|---|---|
| USB 自動検知 | `/Volumes` を FSEvents で監視、RECORDER_ID.json を検出 |
| インポート | ファイルスキャン → ハッシュ → 変換 → アップロード |
| 手動アップロード | ファイル選択ダイアログから音声ファイルをアップロード |
| バッチ管理 | 過去のインポート履歴、ファイル状態の確認 |
| システムトレイ | メニューバーに常駐、クリックでウィンドウ表示 |

詳細は [desktop/README-ja.md](../desktop/README-ja.md) を参照してください。

---

## 7. レコーダー準備

各ボイスレコーダーのルートディレクトリに識別ファイルを配置します。

### 7.1 RECORDER_ID.json の作成

レコーダーを USB 接続して `/Volumes/レコーダー名/` に以下のファイルを作成:

```bash
# 例: Table-1 用レコーダー
cat > /Volumes/IC_RECORDER/RECORDER_ID.json << 'EOF'
{
  "deviceId": "dev-seeddevice1",
  "label": "Table-1",
  "orgIdHint": "org-seed000001",
  "notes": "テーブル1固定"
}
EOF
```

| フィールド | 必須 | 説明 |
|---|---|---|
| `deviceId` | **必須** | サーバーの `devices` テーブルに登録されている ID |
| `label` | **必須** | テーブル番号など分かりやすいラベル |
| `orgIdHint` | 任意 | 組織 ID のヒント（将来用） |
| `notes` | 任意 | メモ |

### 7.2 デバイス登録

RECORDER_ID.json の `deviceId` は、サーバーの `devices` テーブルに事前登録が必要です。

D1 に直接投入する場合:

```bash
wrangler d1 execute voice-trunk-db --remote --command "
INSERT INTO devices (id, orgId, label, expectedIdentifierFileName)
VALUES ('dev-table1-001', 'org-yourorg', 'Table-1', 'RECORDER_ID.json');
"
```

今後 Web UI の管理画面（/admin/devices）からも登録できます。

---

## 8. 日常運用フロー

### ワークショップ当日

1. **事前**: レコーダーに RECORDER_ID.json が入っていることを確認
2. **録音**: 各テーブルにレコーダーを配置して録音
3. **終了後**: レコーダーを Mac に USB 接続
4. **自動取り込み**: Importer（watch モード）が自動で検出・コピー・アップロード
5. **確認**: ターミナルのログで進捗を確認

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

### 複数台の場合

1. 1台目を接続 → 自動取り込み開始
2. 完了を待ってから（またはログが次を待っている状態で）2台目を接続
3. 同様に自動検出される
4. 全台完了後、Web UI でバッチの状況を確認

### アップロード後の処理

アップロード完了後、サーバー側で自動的に以下が実行されます（所要時間: 数分〜十数分/ファイル）:

1. `load_metadata` — DB からメタデータ読み込み
2. `ensure_audio_access` — R2 の音声ファイルにアクセス確認
3. `maybe_split_audio` — 長い音声の場合チャンク分割（Phase 1 ではローカルで分割済み）
4. `transcribe_chunks` — Gemini API で文字起こし
5. `merge_transcripts` — チャンク間の文字起こし結果を統合
6. `summarize` — 要約生成（短/長/要点/決定事項/未決事項）
7. `claims_extract` — 主張抽出（賛成/反対/不確定/伝聞のスタンス付き）
8. `grouping` — 同一ワークショップへの自動グルーピング
9. `index_for_search` — 全文検索インデックス作成
10. `notify` — 完了通知（MVP ではログのみ）
11. `finalize` — 最終ステータス更新

### 処理が失敗した場合

- Web UI の録音詳細ページで、どのステップで失敗したか確認可能
- 「再処理」ボタンで失敗ステップから再実行可能
- ステータスが `PARTIAL`（一部成功）の場合、成功した部分は保持される

---

## 9. Web UI の使い方

### ページ一覧

| URL | ページ | 説明 |
|---|---|---|
| `/` | ダッシュボード | 最近のバッチ、処理中/エラー録音の概要 |
| `/workshops` | ワークショップ一覧 | 日付・場所でフィルタ |
| `/workshops/[id]` | ワークショップ詳細 | 紐づく録音一覧 |
| `/batches` | バッチ一覧 | インポートバッチの一覧 |
| `/batches/[id]` | バッチ詳細 | デバイス別ファイル一覧・進捗 |
| `/drafts` | ドラフト一覧 | 自動推定されたワークショップ候補 |
| `/drafts/[id]` | ドラフト詳細 | 確定/統合/破棄の操作 |
| `/recordings/[id]` | 録音詳細 | 音声プレイヤー・文字起こし・要約・主張・再処理 |
| `/admin/devices` | デバイス管理 | 登録済みレコーダー一覧 |
| `/admin/workshops/new` | ワークショップ作成 | 手動でワークショップを作成 |
| `/admin/users` | ユーザー管理 | ユーザー・権限の管理 |

### ドラフトの確定フロー

処理パイプラインの `grouping` ステップが、同一バッチの録音を「ワークショップ候補（ドラフト）」として自動グルーピングします。

1. `/drafts` でドラフト一覧を確認
2. ドラフトを選択 → タイトル・日付・場所を入力して「確定」
3. 確定すると正式な Workshop に昇格し、紐づく録音の `workshopId` が設定される
4. 不要なドラフトは「破棄」、統合したい場合は「統合」

---

## 10. トラブルシューティング

### Importer 関連

**「ffmpeg not found」と表示される**

```bash
brew install ffmpeg
```

**「Storage limit reached」と表示される**

```bash
# 完了済みバッチを削除
bun run importer/src/index.ts clean

# または config.json の maxStorageGB を増やす
```

**レコーダーが検出されない**

- `/Volumes` にマウントされているか確認: `ls /Volumes`
- RECORDER_ID.json がレコーダーのルートにあるか確認
- deviceId がサーバーの devices テーブルに登録されているか確認

**アップロードが失敗する**

- config.json の `serverUrl` が正しいか確認
- Service Token の `clientId`/`clientSecret` が正しいか確認
- ネットワーク接続を確認
- `bun run importer/src/index.ts status` で状態を確認
- `bun run importer/src/index.ts upload` で再アップロード試行

### サーバー関連

**Workflow が失敗する**

```bash
# Workflow の実行一覧を確認
wrangler workflows instances list recording-pipeline-workflow

# 特定のインスタンスの詳細
wrangler workflows instances describe recording-pipeline-workflow <instance-id>
```

**D1 の状態を確認する**

```bash
# 録音の状態一覧
wrangler d1 execute voice-trunk-db --remote --command "
SELECT id, originalFileName, status, updatedAt FROM recordings ORDER BY updatedAt DESC LIMIT 10
"

# 処理ランの状態
wrangler d1 execute voice-trunk-db --remote --command "
SELECT id, recordingId, status, failedStep, error FROM processing_runs ORDER BY startedAt DESC LIMIT 10
"
```

**Gemini API レート制限**

- 大量ファイルを同時処理すると 429 エラーが発生する場合があります
- `wrangler.toml` の `GEMINI_MAX_CONCURRENT` を下げてください（デフォルト: 5）
- 自動リトライ（指数バックオフ）で回復しますが、多すぎると全体が遅延します

---

## 11. アーキテクチャ詳細

### ディレクトリ構造

```
voice-trunk/
├── migrations/                    # D1 マイグレーション
│   └── 0001_initial_schema.sql    # 12テーブル定義
├── src/
│   ├── app.d.ts                   # SvelteKit 型定義
│   ├── app.html                   # HTML テンプレート
│   ├── app.css                    # Tailwind CSS + カスタムテーマ
│   ├── lib/
│   │   ├── api/client.ts          # フロントエンド用 API クライアント
│   │   ├── components/            # 共有 Svelte コンポーネント
│   │   │   ├── AudioPlayer.svelte
│   │   │   ├── ClaimsPanel.svelte
│   │   │   ├── Pagination.svelte
│   │   │   ├── RecordingProgress.svelte
│   │   │   ├── StatusBadge.svelte
│   │   │   └── TranscriptViewer.svelte
│   │   ├── constants.ts           # 定数（エラーコード、ステップ名等）
│   │   ├── types/                 # 型定義
│   │   │   ├── index.ts           # 全共有型
│   │   │   └── env.ts             # Worker Env 型
│   │   ├── utils/                 # ユーティリティ
│   │   │   ├── id.ts              # ID 生成
│   │   │   └── response.ts        # JSON レスポンスヘルパー
│   │   └── server/
│   │       ├── api/middleware.ts   # 認証・バリデーションミドルウェア
│   │       ├── auth/              # 認証
│   │       │   ├── resolve-org.ts # orgId 解決
│   │       │   └── verify-jwt.ts  # JWT 検証
│   │       ├── db/                # データベースレイヤー（12ファイル）
│   │       ├── r2/                # R2 操作
│   │       │   ├── keys.ts        # R2 キー構築
│   │       │   └── presign.ts     # Presigned URL 生成
│   │       ├── gemini/            # Gemini API
│   │       │   ├── client.ts      # API ラッパー
│   │       │   └── prompts.ts     # プロンプトテンプレート
│   │       └── workflow/          # ワークフロー
│   │           ├── retry-config.ts
│   │           └── steps/         # 11ステップ
│   ├── routes/
│   │   ├── +layout.svelte         # 共通レイアウト（サイドバー）
│   │   ├── +page.svelte           # ダッシュボード
│   │   ├── api/v1/                # API エンドポイント（15本）
│   │   ├── workshops/             # ワークショップ管理
│   │   ├── batches/               # バッチ管理
│   │   ├── drafts/                # ドラフト管理
│   │   ├── recordings/            # 録音詳細
│   │   └── admin/                 # 管理画面
│   └── worker/
│       ├── index.ts               # Worker エントリポイント
│       ├── queue-consumer.ts      # Queue ハンドラ
│       └── workflows/
│           └── recording-pipeline.ts # WorkflowEntrypoint
├── desktop/                       # デスクトップアプリ（Tauri v2）
│   ├── src-tauri/                 # Rust バックエンド
│   │   ├── src/                   # Rust ソース（18ファイル）
│   │   └── Cargo.toml
│   ├── src/                       # SvelteKit フロントエンド
│   │   ├── routes/                # ページ（status/upload/batches/settings）
│   │   └── lib/                   # 型定義・ストア・コンポーネント
│   └── package.json
├── importer/                      # Importer CLI（独立パッケージ）
│   ├── package.json
│   ├── src/
│   │   ├── index.ts               # CLI エントリ
│   │   ├── mount-detector.ts      # マウント検知
│   │   ├── identifier.ts          # RECORDER_ID.json パーサー
│   │   ├── file-scanner.ts        # 音声ファイルスキャン
│   │   ├── hasher.ts              # SHA-256 計算
│   │   ├── inbox.ts               # Inbox 管理
│   │   ├── audio-converter.ts     # ffmpeg 変換
│   │   ├── audio-splitter.ts      # ffmpeg 分割
│   │   ├── api-client.ts          # サーバー API クライアント
│   │   ├── uploader.ts            # アップロード処理
│   │   ├── state.ts               # 状態管理
│   │   └── config.ts              # 設定管理
│   └── com.voice-trunk.importer.plist  # launchd 設定
├── tests/                         # テスト
├── wrangler.toml                  # Cloudflare 設定
├── svelte.config.js
├── vite.config.ts
└── package.json
```

### Recording ステータス遷移

```
REGISTERED → UPLOADING → UPLOADED → PROCESSING → DONE
                                              → PARTIAL（一部成功）
                                              → ERROR
PARTIAL → PROCESSING（再処理）
ERROR   → PROCESSING（再処理）
DONE    → PROCESSING（再処理）
```

### R2 キー構造

```
org/{orgId}/recording/{recordingId}/raw/{fileName}         # 元音声
org/{orgId}/recording/{recordingId}/chunks/{idx}_{start}_{end}.mp3  # チャンク
org/{orgId}/recording/{recordingId}/runs/{runId}/transcript.json    # 文字起こし
org/{orgId}/recording/{recordingId}/runs/{runId}/summary.json      # 要約
org/{orgId}/recording/{recordingId}/runs/{runId}/claims.json       # 主張
```

### API エンドポイント一覧

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/v1/devices` | デバイス一覧 |
| POST | `/api/v1/recordings/preflight` | 単一ファイル重複判定 |
| POST | `/api/v1/recordings/preflight-batch` | 一括重複判定（最大200件） |
| GET | `/api/v1/recordings` | 録音一覧 |
| GET | `/api/v1/recordings/[id]` | 録音詳細 |
| POST | `/api/v1/recordings/[id]/presign` | presigned URL 発行 |
| POST | `/api/v1/recordings/[id]/presign-part` | マルチパートパート URL |
| POST | `/api/v1/recordings/[id]/complete-multipart` | マルチパート完了 |
| POST | `/api/v1/recordings/[id]/complete` | アップロード完了通知 |
| POST | `/api/v1/recordings/[id]/reprocess` | 再処理 |
| GET | `/api/v1/workshops` | ワークショップ一覧 |
| POST | `/api/v1/workshops/[id]/export` | エクスポート |
| GET | `/api/v1/import_batches` | バッチ一覧 |
| GET | `/api/v1/workshop_drafts` | ドラフト一覧 |
| POST | `/api/v1/workshop_drafts/[id]/confirm` | ドラフト確定 |

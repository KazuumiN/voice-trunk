# クイックスタート（最短手順）

全体の手順を最短で示します。詳細は [setup-guide-ja.md](./setup-guide-ja.md) を参照。

---

## Step 1: Cloudflare リソース作成（初回のみ・5分）

```bash
# ログイン
wrangler login

# D1 データベース
wrangler d1 create voice-trunk-db
# → 出力された database_id を wrangler.toml に貼る

# R2 バケット
wrangler r2 bucket create r2-raw-audio
wrangler r2 bucket create r2-artifacts

# Queue
wrangler queues create recording-upload-queue

# R2 イベント通知
wrangler r2 bucket notification create r2-raw-audio \
  --event-type object-create \
  --queue recording-upload-queue
```

## Step 2: シークレット設定（初回のみ・5分）

```bash
wrangler secret put GEMINI_API_KEY
wrangler secret put CF_ACCESS_TEAM_DOMAIN
wrangler secret put CF_ACCESS_AUD
wrangler secret put R2_ACCOUNT_ID
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY
```

## Step 3: ビルド＋デプロイ（2分）

```bash
bun install
bun run build

# マイグレーション（リモート）
wrangler d1 migrations apply voice-trunk-db --remote

# デプロイ
wrangler deploy
```

## Step 4: 初期データ登録（初回のみ・3分）

D1 に組織・ユーザー・デバイスを登録:

```bash
wrangler d1 execute voice-trunk-db --remote --command "
INSERT INTO orgs (id, name) VALUES ('org-yourorg', 'あなたの組織名');
INSERT INTO users (id, orgId, accessSub, email, displayName, role) VALUES ('usr-admin01', 'org-yourorg', 'Cloudflare Access の sub 値', 'you@example.com', 'あなたの名前', 'admin');
INSERT INTO devices (id, orgId, label, expectedIdentifierFileName) VALUES ('dev-table1', 'org-yourorg', 'Table-1', 'RECORDER_ID.json');
INSERT INTO devices (id, orgId, label, expectedIdentifierFileName) VALUES ('dev-table2', 'org-yourorg', 'Table-2', 'RECORDER_ID.json');
INSERT INTO devices (id, orgId, label, expectedIdentifierFileName) VALUES ('dev-table3', 'org-yourorg', 'Table-3', 'RECORDER_ID.json');
"
```

## Step 5: レコーダーに識別ファイルを配置（初回のみ）

レコーダーの USB ルートに `RECORDER_ID.json` を作成:

```json
{
  "deviceId": "dev-table1",
  "label": "Table-1"
}
```

## Step 6: 取り込みツール（2つの選択肢）

### 選択肢A: デスクトップアプリ（推奨）

GUI で操作でき、非開発者にも提供可能です。

```bash
# 前提: Rust が必要
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# ffmpeg
brew install ffmpeg

# ビルド＋起動
cd desktop && npm install && npm run tauri dev
```

アプリの設定画面でサーバーURL・認証情報を入力してください。
詳細は [desktop/README-ja.md](../desktop/README-ja.md) を参照。

### 選択肢B: CLI Importer（従来方式）

ターミナルに慣れた開発者向けです。

```bash
# 依存インストール
cd importer && bun install && cd ..

# ffmpeg
brew install ffmpeg

# 設定ファイル作成
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

## Step 7: 運用開始

### デスクトップアプリの場合

1. アプリを起動（システムトレイに常駐）
2. レコーダーを USB 接続 → 自動検知
3. 「インポート」ボタンで取り込み開始

### CLI Importer の場合

```bash
# Importer 起動（ターミナルに常駐）
bun run importer/src/index.ts watch
```

いずれの方法でも、レコーダー接続後に自動的に:
1. 新しい録音ファイルを検出
2. ローカルにコピー（SHA-256 で重複排除）
3. 必要に応じて MP3 変換
4. R2 にアップロード
5. 文字起こし → 要約 → 主張抽出が自動実行

Web UI（デプロイした Workers の URL）で結果を確認できます。

---

## CLI Importer を常駐化したい場合（Mac ログイン時に自動起動）

```bash
mkdir -p ~/Library/Logs/voice-trunk
cp importer/com.voice-trunk.importer.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.voice-trunk.importer.plist
```

## よく使うコマンド

```bash
# CLI Importer: 状態確認
bun run importer/src/index.ts status

# CLI Importer: 未アップロードを手動で再送
bun run importer/src/index.ts upload

# CLI Importer: 完了済みバッチを削除（ディスク節約）
bun run importer/src/index.ts clean

# テスト
bun run test

# サーバー側ローカル開発
bun run dev

# デスクトップアプリ開発
cd desktop && npm run tauri dev
```

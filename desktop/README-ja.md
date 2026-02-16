# VoiceTrunk Desktop

ICレコーダーの録音ファイルを自動取り込み・アップロードするデスクトップアプリ（Tauri v2 + SvelteKit）。

既存の CLI importer (`importer/`) の GUI 版です。USB レコーダーの接続検知、自動インポート、手動アップロード、バッチ管理、設定画面を備えています。

## 前提条件

| ツール | バージョン | インストール |
|---|---|---|
| Node.js | 20+ | `brew install node` |
| Rust | 1.80+ | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| ffmpeg | 最新 | `brew install ffmpeg`（音声変換に使用） |

Xcode Command Line Tools も必要です:

```bash
xcode-select --install
```

## セットアップ

```bash
cd desktop
npm install
```

## 開発

```bash
npm run tauri dev
```

SvelteKit の dev server（port 1420）と Rust バックエンドが同時に起動します。ホットリロード対応。

## ビルド

```bash
npm run tauri build
```

出力先:
- `.app` バンドル: `src-tauri/target/release/bundle/macos/VoiceTrunk.app`
- `.dmg` インストーラー: `src-tauri/target/release/bundle/dmg/` （署名が必要）

## 初回起動後の設定

1. アプリ起動後、サイドバーの「設定」を開く
2. **サーバーURL**: Cloudflare Workers のデプロイ先 URL を入力（例: `https://voice-trunk.xxx.workers.dev`）
3. **Client ID / Client Secret**: Cloudflare Access の Service Token を入力
4. 「接続テスト」ボタンで疎通確認
5. ffmpeg パスを確認（通常は `ffmpeg` でOK）

## 使い方

### USB レコーダーから自動インポート

1. アプリがシステムトレイに常駐（メニューバーのアイコン）
2. RECORDER_ID.json 付きのレコーダーを USB 接続
3. 自動検知 → ステータスページに表示
4. 「インポート」ボタンをクリック（設定で自動インポートを有効にすることも可能）
5. 進捗がリアルタイム表示される

### 手動アップロード

1. サイドバーの「アップロード」を開く
2. 「ファイルを選択」でローカルの音声ファイルを選択
3. SHA-256 ハッシュ計算 → サーバーに重複チェック → アップロード

### バッチ管理

1. サイドバーの「バッチ」を開く
2. 過去のインポートバッチ一覧を表示
3. 各バッチの個別ファイル状態を確認可能
4. 「完了済みをクリーン」でローカル Inbox のディスク領域を解放

## ディレクトリ構成

```
desktop/
├── src-tauri/               # Rust バックエンド
│   ├── Cargo.toml
│   ├── tauri.conf.json      # Tauri 設定
│   ├── capabilities/        # 権限定義
│   ├── icons/               # アプリアイコン
│   └── src/
│       ├── main.rs          # エントリーポイント
│       ├── lib.rs           # モジュール宣言・プラグイン登録
│       ├── config.rs        # AppConfig 読み書き
│       ├── state.rs         # バッチ/ファイル状態管理 + JSON 永続化
│       ├── error.rs         # AppError 型
│       ├── events.rs        # イベントペイロード型
│       ├── volume_watcher.rs # /Volumes 監視 (FSEvents)
│       ├── tray.rs          # システムトレイ
│       └── commands/        # Tauri コマンド
│           ├── config.rs    # 設定 CRUD
│           ├── volumes.rs   # デバイス検知・識別
│           ├── scanner.rs   # ファイルスキャン (walkdir)
│           ├── hasher.rs    # SHA-256 ハッシュ
│           ├── converter.rs # ffmpeg 変換
│           ├── api_client.rs # サーバー API 通信 (reqwest)
│           ├── uploader.rs  # presigned URL アップロード
│           ├── importer.rs  # インポートオーケストレーション
│           └── batches.rs   # バッチ管理
├── src/                     # SvelteKit フロントエンド
│   ├── app.html / app.css
│   ├── routes/
│   │   ├── +layout.svelte   # サイドバー + 接続状態
│   │   ├── status/          # メインダッシュボード
│   │   ├── upload/          # 手動アップロード
│   │   ├── batches/         # バッチ一覧
│   │   └── settings/        # 設定画面
│   └── lib/
│       ├── tauri.ts         # invoke() ラッパー + イベントリスナー
│       ├── types.ts         # TypeScript 型定義
│       ├── stores.svelte.ts # Svelte 5 リアクティブストア
│       └── components/      # UI コンポーネント
├── package.json
├── svelte.config.js         # adapter-static (SSR off)
└── vite.config.ts
```

## 技術スタック

- **Tauri v2** — Rust バックエンド + Web フロントエンド
- **SvelteKit** — adapter-static, SSR off, Svelte 5 runes
- **Tailwind CSS v4** — UI スタイリング
- **Rust crates**: reqwest (HTTP), sha2 (ハッシュ), notify (FSEvents), walkdir (ファイルスキャン), tokio (非同期)
- **Tauri plugins**: dialog, notification, shell, store

## データの保存先

```
~/Library/Application Support/com.liquitous.voice-trunk/
├── config.json    # アプリ設定
├── state.json     # バッチ・ファイル状態（importer/state.json と互換）
└── inbox/         # 一時的な音声ファイル置き場
```

認証情報（Client ID / Secret）は OS の Keychain に保存されます（`tauri-plugin-store` 経由）。

## 既存 importer との関係

- `importer/` は CLI（Bun）ベースのツールで、`launchd` で常駐化する形式
- `desktop/` はそのGUI版で、同じサーバー API を使用
- `state.json` は互換形式なので、importer からの移行が可能
- 将来的に importer は deprecate 予定

## トラブルシューティング

### ビルドエラー: Rust が見つからない

```bash
source ~/.cargo/env
```

を実行するか、シェルプロファイル（`.zshrc`）に追加してください。

### ffmpeg が検出されない

設定ページで ffmpeg パスを明示的に指定してください（例: `/opt/homebrew/bin/ffmpeg`）。

### DMG ビルドが失敗する

`.app` バンドルは正常に生成されます。DMG の生成にはコード署名が必要です。開発時は `.app` を直接使用してください。

### サーバーに接続できない

1. サーバー URL が正しいか確認
2. Service Token の Client ID / Secret が有効か確認
3. Cloudflare Access の設定で Service Token が許可されているか確認

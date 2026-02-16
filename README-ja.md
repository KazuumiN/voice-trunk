# VoiceTrunk

> [!CAUTION]
> 残念ながら、このプロジェクトは未完了です。まだ、完全な状態で動作させることはできません。

市民ワークショップの録音ファイルをUSBレコーダーから自動で取り込み、クラウドにアップロードし、AIパイプライン（文字起こし・要約・主張抽出）で処理するシステムです。

[English](./README.md)

## アーキテクチャ

```
┌──────────────────────┐     ┌────────────────────────────────────────────┐
│ スタッフの Mac        │     │ Cloudflare                                  │
│                      │     │                                            │
│  レコーダー USB       │     │  ┌─────────┐  ┌────┐  ┌──────────────┐   │
│    ↓                 │     │  │ SvelteKit│  │ D1 │  │ R2 (音声)     │   │
│  デスクトップアプリ    │────→│  │ Web+API  │  │ DB │  │ R2 (成果物)   │   │
│  (Tauri v2, 推奨)    │     │  └─────────┘  └────┘  └──────────────┘   │
│  または               │     │       ↑                      ↓            │
│  CLI Importer        │     │  ┌─────────┐  ┌──────────────────────┐   │
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

## コンポーネント

### 1. サーバー (`src/`)

Cloudflare Workers 上で動作する SvelteKit アプリケーション。録音・文字起こし・要約・主張を閲覧する Web UI、デスクトップアプリおよび CLI Importer が使用する REST API、Gemini API を利用した文字起こし・要約・主張抽出のバックグラウンド処理パイプライン（Cloudflare Workflows）を提供します。

### 2. デスクトップアプリ (`desktop/`)

USB ボイスレコーダーからの録音取り込み用 Tauri v2 GUI アプリケーション。非開発者のスタッフにも推奨。USB 自動検知、ワンクリックインポート、手動アップロード、バッチ管理、システムトレイ常駐に対応しています。詳細は [desktop/README-ja.md](./desktop/README-ja.md) を参照してください。

### 3. CLI Importer (`importer/`)

デスクトップアプリの代替となる、開発者向けの Bun ベースコマンドラインツール。USB レコーダーの接続を監視し、音声ファイルのコピー・重複排除・形式変換・R2 へのアップロードを行います。launchd によるデーモン化が可能です。

## クイックスタート

セットアップの全手順は [docs/quickstart-ja.md](./docs/quickstart-ja.md) を参照してください。

最短の起動コマンド:

```bash
# サーバー（ローカル開発）
bun install
bun run dev

# デスクトップアプリ
cd desktop && npm install && npm run tauri dev
```

## ディレクトリ構成

```
voice-trunk/
├── src/                # サーバー: SvelteKit アプリ (Web UI + API + パイプライン)
├── desktop/            # デスクトップアプリ: Tauri v2 GUI インポーター
├── importer/           # CLI インポーター: Bun ベースの代替ツール
├── docs/               # ドキュメント（日本語 + 英語）
├── migrations/         # D1 (SQLite) マイグレーションファイル
├── tests/              # ユニットテスト (Vitest)
├── wrangler.toml       # Cloudflare Workers 設定
└── package.json
```

## 技術スタック

| レイヤー | 技術 |
|---|---|
| Web フレームワーク | SvelteKit (Svelte 5 runes) |
| スタイリング | Tailwind CSS v4 |
| クラウドプラットフォーム | Cloudflare Workers, D1, R2, Queues, Workflows |
| AI 処理 | Google Gemini API |
| デスクトップアプリ | Tauri v2, Rust |
| CLI インポーター | Bun (TypeScript) |
| テスト | Vitest |

## ドキュメント

| ドキュメント | 説明 |
|---|---|
| [docs/quickstart-ja.md](./docs/quickstart-ja.md) | クイックスタートガイド（最短手順） |
| [docs/setup-guide-ja.md](./docs/setup-guide-ja.md) | セットアップ・運用の詳細ガイド |
| [desktop/README-ja.md](./desktop/README-ja.md) | デスクトップアプリのドキュメント |
| [importer/README-ja.md](./importer/README-ja.md) | CLI インポーターのドキュメント |

英語版は `-ja` なしのファイル名で提供されています（例: `docs/quickstart.md`, `docs/setup-guide.md`）。

## ライセンス

非公開。全権利留保。

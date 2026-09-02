# 計画: 人手でホストから済ませること（完了したら削除）

credential を扱う作業を人間がホストで行う。**ホストの wrangler は `packages/web` で `./node_modules/.bin/wrangler`**（コンテナが lockfile どおりに入れたものが bind mount で見える。グローバルに入れない。`pnpm exec` は pnpm 11 が install を自動実行してコンテナの `node_modules` を消そうとするので使わない — [local-dev.md](../local-dev.md)）。済んだ節は削除して `docs/log.md` に 1 行、全部済んだらこのファイルごと削除（番号は参照が壊れないよう詰めない）。残るは 4 のみ。

## 4. Workers Builds の後始末（dash の接続は 2026-09-02 完了）

**接続済みの内容**（Worker `matatabetai` → 設定 → ビルド）: リポジトリ `okayus/matatabetai` / 本番ブランチ `main` / プレビュービルド **OFF** / ビルド `pnpm install --frozen-lockfile && pnpm run build` / デプロイ `pnpm exec wrangler d1 migrations apply matatabetai --remote && pnpm exec wrangler deploy` / ルートディレクトリ `packages/web` / トークン `matatabetai Workers Builds`（dash 生成、D1 Storage と R2 Storage の Edit を含む）/ 監視パス除外 `docs/*` `*.md`。

**残り**:

1. `deploy.yml` 削除 PR を merge し、`main` への push で `Workers Builds: matatabetai` の check-run が付くこと（= push 起動）を確認する。この経路は初回が手動ビルドではないので、最初の push がそのまま実証になる
2. deploy と本番 `/health` が通ったら secrets を退役: `gh secret delete CLOUDFLARE_API_TOKEN` と `gh secret delete CLOUDFLARE_ACCOUNT_ID`
3. My Profile → API トークンで、旧 `CLOUDFLARE_API_TOKEN` に使っていたトークンを削除する（`matatabetai Workers Builds` は残す）
4. `docs/roadmap.md` Phase 1 の「Workers Builds へ移行し `deploy.yml` と GitHub secrets を撤去」にチェック → このファイルを削除

**skill との差分**（`cloudflare-workers-builds-keyless-deploy` へ還元済み）: 既存 Worker があると「アプリケーションを作成する」経路は `この名前のプロジェクトはすでに存在します` で弾かれる。正しい入口は Worker → 設定 → ビルド → Git リポジトリ → 接続。

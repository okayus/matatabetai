# 計画: 人手でホストから済ませること（完了したら削除）

credential を扱う作業を人間がホストで行う。**ホストの wrangler は `packages/web` で `./node_modules/.bin/wrangler`**（コンテナが lockfile どおりに入れたものが bind mount で見える。グローバルに入れない。`pnpm exec` は pnpm 11 が install を自動実行してコンテナの `node_modules` を消そうとするので使わない — [local-dev.md](../local-dev.md)）。順は Workers Builds → R2。済んだ節は削除して `docs/log.md` に 1 行、全部済んだらこのファイルごと削除（番号は参照が壊れないよう詰めない）。

## 4. Workers Builds 接続（skill `cloudflare-workers-builds-keyless-deploy` 0.3.0、`references/dashboard-walkthrough.md`）

**Pre-flight（ターミナル）**:

```bash
git fetch origin && git ls-tree --name-only origin/main packages/web/wrangler.jsonc   # パスが出ること
gh pr list --state open                                                              # 未 merge の骨格 PR が無いこと
W=packages/web/node_modules/.bin/wrangler
grep -n '"name"\|database_id' packages/web/wrangler.jsonc; $W d1 list              # name = matatabetai、database_id = 実在の UUID
$W whoami                                                                            # dash にログインするのと同じアカウント
$W deployments list                                                                  # 既存 Worker `matatabetai`（GH Actions deploy 済み）が出る = Workers Builds が引き継ぐ
```

**dash（値）**: Project name = `matatabetai` / Build command = `pnpm install --frozen-lockfile && pnpm run build` / Deploy command = `pnpm exec wrangler d1 migrations apply matatabetai --remote && pnpm exec wrangler deploy` / **非本番ブランチのビルド = OFF** / 詳細設定 → パス（Root directory）= `packages/web` / API トークン = **「新しいトークンを作成する」**で `matatabetai Workers Builds`（picker 既定の他プロジェクトのトークンを選ばない。My Profile で先に作らない）→ デプロイ。初回は手動ビルドで GitHub に check-run が付かない（missed trigger ではない）。Settings → Builds → Build watch paths の除外に `docs/*` と `*.md`。

**接続後（ホストから push）**: `.github/workflows/deploy.yml` を削除する PR（workflow ファイルは token で push できない）→ merge で push 起動ビルドを実証（`Workers Builds: matatabetai` の check-run）→ `gh secret delete CLOUDFLARE_API_TOKEN` と `gh secret delete CLOUDFLARE_ACCOUNT_ID` → My Profile の旧 `CLOUDFLARE_API_TOKEN` 用トークンを削除 → `docs/roadmap.md` Phase 1 の該当項目にチェック。dash 生成トークンは D1 / R2 edit を含む（2026-08-23 時点）。

## 5. R2 bucket

`packages/web/node_modules/.bin/wrangler r2 bucket create matatabetai-photos`（ホスト、`wrangler login` 済み）。Workers Builds 移行前に写真機能を deploy するなら `CLOUDFLARE_API_TOKEN` に `Workers R2 Storage: Edit` を in-place 追加（skill `cloudflare-api-token-permissions`）。移行後は不要。

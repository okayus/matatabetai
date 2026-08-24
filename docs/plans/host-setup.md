# 計画: 人手でホストから済ませること（完了したら削除）

credential を扱う作業を人間がホストで行う。**0 が最優先**（本番が main に追随しない）、以降は 可視性 → Workers Builds → R2 の順。済んだ節は削除して `docs/log.md` に 1 行、全部済んだらこのファイルごと削除（番号は参照が壊れないよう詰めない）。

## 0. `deploy.yml` の pnpm バージョン衝突（最優先。本番が main に追随しない）

#10 の merge 後、Deploy が `Error: Multiple versions of pnpm specified` で落ちている（`pnpm/action-setup@v4` の `version: 9.15.0` vs `package.json` の `packageManager: pnpm@11.22.0`）。`ci.yml` は `version:` を書かない `@v6` なので無傷。本番は #10 前のビルドが動き続けている（`/health` 200。ロジックは変わらないので実害は「main と乖離」だけ）。

- **最短**: `.github/workflows/deploy.yml` から `with: version: 9.15.0` の 3 行を削る。ついでに `pnpm/action-setup@v4` → `@v6`、`actions/checkout@v4` → `@v7`、`actions/setup-node@v4` → `@v7`、`node-version: 22` → `24`。`ci.yml` の `node-version: 22` → `24` も同時に（コンテナは node 24、ルートの `engines` も `>=24`。今は `[WARN] Unsupported engine` が出るだけで CI 自体は緑）
- **あるいは 4 を先に**: Workers Builds に繋げば `deploy.yml` ごと消えるので、この修正は不要になる

## 1. リポの可視性と ruleset（roadmap 決めること 3）

- public にする場合: `gh repo edit okayus/matatabetai --visibility public`
  → `protect-main` ruleset（okayus-skills `cloudflare-workers-builds-keyless-deploy` `references/ruleset.md` の JSON。PR 必須 + required check `ci` + force push 禁止 + `bypass_actors: []`）
  → `no-force-push-anywhere` ruleset（`sandboxed-agent-github-token-via-1password` `references/rulesets-and-policy.md`）
  → `gh api repos/okayus/matatabetai/rulesets` で `enforcement: active` を確認
- private のままにする場合: ruleset は作れても効かない（Free プラン）。main の保護は `.claude/hooks/block-main-commit.sh` と Claude Code の deny だけと承知の上で進める

## 4. Workers Builds 接続（skill `cloudflare-workers-builds-keyless-deploy` 0.3.0、`references/dashboard-walkthrough.md`）

**Pre-flight（ターミナル）**:

```bash
git fetch origin && git ls-tree --name-only origin/main packages/web/wrangler.jsonc   # パスが出ること
gh pr list --state open                                                              # 未 merge の骨格 PR が無いこと
grep -n '"name"\|database_id' packages/web/wrangler.jsonc; wrangler d1 list         # name = matatabetai、database_id = 実在の UUID
wrangler whoami                                                                      # dash にログインするのと同じアカウント
wrangler deployments list                                                            # 既存 Worker `matatabetai`（GH Actions deploy 済み）が出る = Workers Builds が引き継ぐ
```

**dash（値）**: Project name = `matatabetai` / Build command = `pnpm install --frozen-lockfile && pnpm run build` / Deploy command = `pnpm exec wrangler d1 migrations apply matatabetai --remote && pnpm exec wrangler deploy` / **非本番ブランチのビルド = OFF** / 詳細設定 → パス（Root directory）= `packages/web` / API トークン = **「新しいトークンを作成する」**で `matatabetai Workers Builds`（picker 既定の他プロジェクトのトークンを選ばない。My Profile で先に作らない）→ デプロイ。初回は手動ビルドで GitHub に check-run が付かない（missed trigger ではない）。Settings → Builds → Build watch paths の除外に `docs/*` と `*.md`。

**接続後（ホストから push）**: `.github/workflows/deploy.yml` を削除する PR（workflow ファイルは token で push できない）→ merge で push 起動ビルドを実証（`Workers Builds: matatabetai` の check-run）→ `gh secret delete CLOUDFLARE_API_TOKEN` と `gh secret delete CLOUDFLARE_ACCOUNT_ID` → My Profile の旧 `CLOUDFLARE_API_TOKEN` 用トークンを削除 → `docs/roadmap.md` Phase 1 の該当項目にチェック。dash 生成トークンは D1 / R2 edit を含む（2026-08-23 時点）。

## 5. R2 bucket

`wrangler r2 bucket create matatabetai-photos`（ホスト、`wrangler login` 済み）。Workers Builds 移行前に写真機能を deploy するなら `CLOUDFLARE_API_TOKEN` に `Workers R2 Storage: Edit` を in-place 追加（skill `cloudflare-api-token-permissions`）。移行後は不要。

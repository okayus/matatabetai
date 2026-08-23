# 計画: 人手でホストから済ませること（完了したら削除）

コンテナ内エージェントに渡す前に、credential を扱う作業を人間がホストで行う。順序に意味がある（可視性 → token → Workers Builds）。各ステップが済んだら `docs/log.md` に 1 行、全部済んだらこのファイルを削除。

## 1. リポの可視性と ruleset（roadmap 決めること 3）

- public にする場合: `gh repo edit okayus/matatabetai --visibility public`
  → `protect-main` ruleset（okayus-skills `cloudflare-workers-builds-keyless-deploy` `references/ruleset.md` の JSON。PR 必須 + required check `ci` + force push 禁止 + `bypass_actors: []`）
  → `no-force-push-anywhere` ruleset（`sandboxed-agent-github-token-via-1password` `references/rulesets-and-policy.md`）
  → `gh api repos/okayus/matatabetai/rulesets` で `enforcement: active` を確認
- private のままにする場合: ruleset は作れても効かない（Free プラン）。main の保護は `.claude/hooks/block-main-commit.sh` と Claude Code の deny だけと承知の上で進める

## 2. サンドボックス用 GitHub token（skill `sandboxed-agent-github-token-via-1password`）

1. GitHub → Settings → Developer settings → Fine-grained tokens: Resource owner = 自分、Repository access = **`okayus/matatabetai` のみ**、Contents: Read and write、Pull requests: Read and write（任意で Actions: Read）、**Workflows なし**、期限 90 日
2. 画面から直接 1Password へ: `op item create --category "API Credential" --vault "Private" --title "github-pat-matatabetai-sandbox" 'credential=<token>' 'hostname=github.com' 'expires=<YYYY-MM-DD>'`。先に `op item list --vault Private | grep github-pat-` で同名の item が無いことを確認
3. `eval $(op signin)` → `docker compose down && ./up.sh` → `docker compose logs dev | grep NOTE`（`GH_TOKEN absent` が**出ない**こと）
4. E2E（コンテナ内 `docker compose exec dev zsh`）: `git switch -c claude/e2e-token && git commit --allow-empty -m "chore: e2e token push" && git push -u origin claude/e2e-token && gh pr create --fill && gh pr checks`。否定テスト: PR の無い別ブランチの commit を `git push origin HEAD:main` → public + ruleset なら `GH013` で拒否（private なら通ってしまうので実施しない）。`.github/workflows/ci.yml` への変更 push → `without \`workflow\` scope` で拒否されることも確認
5. ホストで E2E の PR を merge（`delete_branch_on_merge` で remote branch は消える）、コンテナ内 `git fetch --prune`

## 3. コンテナ内 claude の初回認証と MCP の承認

`docker compose exec dev claude` → OAuth URL をホストブラウザで開いてコードを貼る → project MCP（`cloudflare-docs` / `context7`）の trust を承認 → `claude mcp list` が `✔ Connected`。最初のメッセージに `docs/status.md` が注入されていることを確認（SessionStart hook。skill `agent-status-hub` の UNVERIFIED「コンテナ内で hook が発火する」の確認になる → 結果を skill に書き戻す）

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

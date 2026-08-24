# 計画: 人手でホストから済ませること（完了したら削除）

credential を扱う作業を人間がホストで行う。順は ruleset → Workers Builds → R2。済んだ節は削除して `docs/log.md` に 1 行、全部済んだらこのファイルごと削除（番号は参照が壊れないよう詰めない）。

## 1. ruleset の作成（可視性は決定済み — 残りはこれだけ）

public 化は 2026-08-23 に済んでいる（ADR-001 改訂）が **ruleset が未作成**で、main の保護がホストの hook と deny 頼みのまま。enforcement は public + Free で有効。auto-merge の repo 設定は有効化済み（2026-08-24）。`gh api` は settings で deny なので人間が打つ:

```bash
gh api repos/okayus/matatabetai/rulesets -X POST --input - <<'JSON'
{
  "name": "protect-main",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "pull_request", "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false
    }},
    { "type": "required_status_checks", "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [ { "context": "ci", "integration_id": 15368 } ]
    }}
  ],
  "bypass_actors": []
}
JSON

gh api repos/okayus/matatabetai/rulesets -X POST --input - <<'JSON'
{
  "name": "no-force-push-anywhere",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~ALL"], "exclude": [] } },
  "rules": [ { "type": "non_fast_forward" } ],
  "bypass_actors": []
}
JSON
```

確認: `gh ruleset list` に 2 本（`active`）、`gh ruleset check main` に protect-main の 4 rules。JSON の出典は okayus-skills `cloudflare-workers-builds-keyless-deploy/references/ruleset.md`（verbatim。`ci` check を GitHub Actions app `integration_id: 15368` に pin）と `sandboxed-agent-github-token-via-1password/references/rulesets-and-policy.md`。作成後、最初の agent PR で `gh pr merge --auto --squash` が fine-grained PAT で通るか確認する（GraphQL mutation。通らなければ CLAUDE.md の merge 節を見直す）。

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

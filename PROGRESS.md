# Progress

セッションを跨いで現状と次の一手を把握するためのファイル。**作業区切りごとに更新する**こと。

Last updated: 2026-08-23

## 完了済み

- 2026-05: リポジトリ初期化、CLAUDE.md に製品意図・認可モデル・インフラ方針・コーディング思想・開発ワークフローを記録。main 直 commit/push 防止 hook
- 2026-05: **Walking Skeleton 本番稼働** — `/health` 200 + SPA 配信。`main` push → GH Actions `deploy.yml` が D1 migrations → deploy。D1 `matatabetai` 作成済・空 migration `0000_init.sql` 適用済
- 2026-06: Cloudflare account subdomain 改名（`toshiaki-mukai-9981` → `shiraoka`）。本番 URL は **https://matatabetai.shiraoka.workers.dev**（旧 URL は解決しない）
- 2026-08-22: 設計の確定と基盤整備（[ADR-001](./docs/adr/001-project-initiation.md)）
  - 要件の正典 [docs/requirements.md](./docs/requirements.md)。認証 = passkey、認可 = per-space + 招待リンク、写真 = private R2 + Worker proxy と決定
  - okayus-skills v0.4.0 に `cloudflare-workers-passkey-auth` / `cloudflare-workers-space-membership-invite` / `cloudflare-r2-private-image-upload` を新設。本リポジトリが最初の利用者（`UNVERIFIED:` 項目の還元ルールは CLAUDE.md）
  - サンドボックス開発環境（`.docker/` + `docker-compose.yml`、node 24、Playwright 1.62.1 chromium 焼き込み、host port **5573**）、`require-container` hook、`wrangler.jsonc` の `RP_ID` / `ORIGIN` を `shiraoka` ホストに更新
- 2026-08-23: **push / PR 経路を「1 リポ限定 PAT を 1Password で注入」に確定**（ADR-001 改訂、skill `sandboxed-agent-github-token-via-1password`）。`./up.sh`、`GH_TOKEN:` passthrough、env-only の credential helper、deny の個別化（force push / `main` / `--delete` / `gh pr merge` / `gh auth` / `gh api`）。relay の下準備は撤去
  - docs アクセス 3 層（skill `cloudflare-mcp-claude-tooling`）: `context7` MCP、docs ホストを firewall OPTIONAL へ、`modern-web-guidance` を project scope に同梱

## 人間がホストで済ませること（次セッションの前提）

1. **コンテナ内 claude の初回認証** — `docker compose exec dev claude` → OAuth URL をホストブラウザで開いてコードを貼る。続けて project MCP（`cloudflare-docs` / `context7`）の trust 承認
2. **サンドボックス用 GitHub token** — fine-grained PAT（Repository access = `okayus/matatabetai` のみ、Contents + Pull requests、Workflows なし、90 日）→ `op item create --category "API Credential" --vault "Private" --title "github-pat-matatabetai-sandbox" 'credential=<token>' 'expires=<YYYY-MM-DD>'` → `eval $(op signin)` → `docker compose down && ./up.sh` → E2E（コンテナ内: `git switch -c claude/e2e-token` → 空 commit → `git push -u origin claude/e2e-token` → `gh pr create --fill` → `gh pr checks`。PR の無い commit の `HEAD:main` push が拒否されること — **private のままだと ruleset が無いので拒否されない**。下記 4 を先に決める）。手順の詳細は [docs/local-dev.md](./docs/local-dev.md)
3. **R2 bucket** — `wrangler r2 bucket create matatabetai-photos`。`CLOUDFLARE_API_TOKEN` に `Workers R2 Storage: Edit` を追加（skill `cloudflare-api-token-permissions`、トークン値は変えずに編集）
4. **リポジトリの可視性を決める（token 経路の前提）** — 現在 private。Free プランでは private だと ruleset / branch protection が**効かず**、token 経路の境界（ruleset + token scope）のうち ruleset 側が無い = main を守るのは hook と Claude Code の deny だけ。nyalog / mazuoboeru / kokemusu と同じく public にするなら `gh repo edit okayus/matatabetai --visibility public` の後に skill `cloudflare-workers-builds-keyless-deploy` の `references/ruleset.md` の `protect-main`（PR 必須 + `ci` check + bypass なし）と、token skill の `no-force-push-anywhere`（`~ALL`）を当てる

## 次のアクション（直近 1-2 手）

1. **ツールチェーン更新 + CI**（chore PR、コンテナ内）— wrangler 3 → 4、`@cloudflare/vite-plugin` 0.1 → 1.x、pnpm 9 → 10、node 22 → 24、`@cloudflare/workers-types` → `wrangler types`。`.github/workflows/ci.yml`（job 名 `ci`）と `deploy.yml` の actions pin 更新は **人間がホストから push**（token に workflows 権限なし）
2. **認証・スペース・招待** — skill `cloudflare-workers-passkey-auth` + `cloudflare-workers-space-membership-invite`。最初の migration から `spaces` / `space_members` / `invites`、ドメイン表は `space_id NOT NULL`。`INITIAL_REGISTRATION_TOKEN` / `SESSION_SECRET` は `wrangler secret put`
3. 以降は CLAUDE.md「次の実装セッションの段取り」の 3〜6

## 未決事項

- **ドメイン取得タイミング** — workers.dev で稼働中、RP_ID も workers.dev に固定済。custom domain に移行するなら **passkey 登録前**（後からは credential 移行戦略が要る）。`matatabetai.app` は 2026-05 時点で空き（未取得）
- **デプロイ経路** — 現状 GH Actions + `CLOUDFLARE_API_TOKEN`。他プロジェクト同様 Workers Builds（キーレス）へ移行するか。移行時は custom build token に **Workers Scripts Edit + D1 Edit + Workers R2 Storage Edit + Account Settings Read + User Details Read**、non-production branch builds は off
- **写真のバックアップ** — R2 に PITR は無い。既定案は「端末に原本が残るので受容」。写真機能の実装時に ADR で決める

## 後回し（Backlog）

- レシピ URL の OGP 取得（`HTMLRewriter`）— 作ったら okayus-skills の新 skill 候補
- 日本語部分一致の FTS5 化（D1 で trigram tokenizer が使えるか要確認）
- スペース切替 UI / 週・月の集計 UI / タグクラウド
- `/grill-with-docs`（okayus-skills `cloudflare-mcp-claude-tooling` 参照）で認証・写真・集計の設計を詰める — 実装前の任意ステップ

## このファイルの運用

- セッション終了時、または大きな区切りで「完了済み」と「次のアクション」を更新
- 「未決事項」は決まったら CLAUDE.md（恒久的な決定）か ADR か該当コードへ移して、ここからは削除
- コードを読めばわかる情報（スキル名のリストアップ、ファイル構成）は書かない

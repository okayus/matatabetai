# ログ（追記専用・新しい順）

1 行 = 1 節目（PR の merge・ADR・人手作業の完了・本番の状態変化）。`- YYYY-MM-DD 何を（#PR / ADR / skill）`。
自動ロードはされない。必要なら `head -20 docs/log.md`。作業中の試行錯誤は書かない（git log と PR にある）。

- 2026-08-23 進捗管理を status hub 化: `docs/status.md`（40 行上限）+ `docs/log.md` + SessionStart hook + `/handoff` + CI の上限検査、secrets 不要の `ci.yml`、`docs/roadmap.md` / `docs/plans/host-setup.md`。PROGRESS.md を廃止、CLAUDE.md を規約のみに（#7、skill `agent-status-hub`）
- 2026-08-23 push / PR 経路を 1 リポ限定 PAT（1Password 注入）に確定。注入点は同日中に `./up.sh`（コンテナ env）→ `./shell.sh`（exec 時のシェル）へ改訂＝ADR-001、docs アクセス 3 層（context7 MCP・docs egress）、`modern-web-guidance` 同梱。relay 下準備は撤去（#6、ADR-001 改訂）
- 2026-08-22 サンドボックス（node 24、Playwright 1.62.1、host port 5573）・docs・ADR-001 を整備、`RP_ID` / `ORIGIN` を shiraoka ホストへ（#4、#5）。okayus-skills v0.4.0 に passkey / space-invite / R2 の 3 skill を新設（本リポが最初の利用者）
- 2026-06 Cloudflare account subdomain 改名（`toshiaki-mukai-9981` → `shiraoka`）。本番 URL は `https://matatabetai.shiraoka.workers.dev`
- 2026-05-21 Walking Skeleton 本番稼働（#2）、`RP_ID` / `ORIGIN` を本番ホストに固定（#3）。D1 `matatabetai` 作成、空 migration 適用
- 2026-05-11 リポジトリ初期化・CLAUDE.md・main 直 commit 防止 hook（#1）

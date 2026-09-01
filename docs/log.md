# ログ（追記専用・新しい順）

1 行 = 1 節目（PR の merge・ADR・人手作業の完了・本番の状態変化）。`- YYYY-MM-DD 何を（#PR / ADR / skill）`。
自動ロードはされない。必要なら `head -20 docs/log.md`。作業中の試行錯誤は書かない（git log と PR にある）。

- 2026-08-31 okayus-skills への還元（passkey-auth 0.2.0 / space-membership-invite 0.2.0 / e2e-playwright 0.2.1 / docker-sandbox 0.6.1）をホストで commit（人手）。#20 で host-setup 6 を初回 owner 登録だけに、ホストの wrangler は `packages/web/node_modules/.bin/wrangler` に統一
- 2026-08-30 #19 を merge — passkey 認証・スペース・招待リンク（migration 0001 が本番 D1 に適用、ADR-002）。ホストで `SESSION_SECRET` を投入し `/api/auth/login/begin` が 200。本番は登録の扉が閉じた状態（`registration_closed`）で稼働。skill 還元: passkey-auth 0.2.0 / space-membership-invite 0.2.0 / e2e-playwright 0.2.1 / docker-sandbox 0.6.1。ホストの `pnpm exec wrangler` は pnpm 11 の自動 install がコンテナの node_modules を消そうとして失敗 → `packages/web/node_modules/.bin/wrangler` を直接叩く運用に
- 2026-08-30 fine-grained PAT で `gh pr merge --auto --squash` の arm（GraphQL mutation）が通ることをコンテナから実証（#16 は CI 先行で即時経路、#17 で `enabledAt` → `ci` 待ち → merge）。okayus-skills token skill の Still open を閉じ 0.2.6 へ。同じ運用（opt-in merge + 安定シェル CI）を kokemusu / mazuoboeru にも展開し、既存リポの上げ方チェックリストを skill 0.2.5 に追加
- 2026-08-29 `protect-main` / `no-force-push-anywhere` ruleset を作成（active、bypass なし）— main の保護がサーバー側へ移り、public 化（08-23）が完結。#13 / #14 を merge、本番は最新 main。ruleset 無しでは `gh pr merge --auto` が CI を待たない（即時 merge / mutation 拒否）ことを実測し okayus-skills token skill 0.2.3 に還元（plans/host-setup.md 1 を削除）
- 2026-08-24 調査で「リポは 2026-08-23 に public 化済みなのに ruleset 未作成」と発覚 → 作成手順を plans/host-setup.md 1 に集約、ci.yml を安定シェル化（`.node-version` / root `ci` script / Dependabot、#13）、merge を `gh pr merge --auto --squash` の opt-in へ（例外は CLAUDE.md。ADR-001 改訂 2026-08-24、#14）
- 2026-08-24 deploy.yml の pnpm 衝突を修正（`pnpm/action-setup` の version 指定を削除し v6 へ、両 workflow を checkout/setup-node v7 + node 24 に）。本番が #10 のツールチェーンに追随（#12。plans/host-setup.md 0 を削除）
- 2026-08-24 ツールチェーンを wrangler 4 / vite 8 / `@cloudflare/vite-plugin` 1.x / pnpm 11 / TypeScript 7 へ更新、バインディング型を `wrangler types` 生成の global `Env` に移行（生成物は gitignore）、`compatibility_date` を 2026-08-20 へ（2026-08-04 以降は `nodejs_compat` / `nodejs_compat_v2` が既定 ON）（#10）
- 2026-08-24 #10 merge 後の Deploy が失敗（`pnpm/action-setup@v4` の `version: 9.15.0` と `packageManager: pnpm@11.22.0` の衝突）。**本番は #10 前のビルドのまま**で main と乖離。修正は `.github/workflows/**` = ホストで人手（plans/host-setup.md 0）
- 2026-08-23 ホスト側の準備が 2 つ完了: 1Password → `./shell.sh` の PAT 注入と、コンテナ内 claude の認証 + MCP 承認。以後 #8 / #9 / #10 はコンテナから push / PR できている（plans/host-setup.md の 2・3 を削除）
- 2026-08-23 進捗管理を status hub 化: `docs/status.md`（40 行上限）+ `docs/log.md` + SessionStart hook + `/handoff` + CI の上限検査、secrets 不要の `ci.yml`、`docs/roadmap.md` / `docs/plans/host-setup.md`。PROGRESS.md を廃止、CLAUDE.md を規約のみに（#7、skill `agent-status-hub`）
- 2026-08-23 push / PR 経路を 1 リポ限定 PAT（1Password 注入）に確定。注入点は同日中に `./up.sh`（コンテナ env）→ `./shell.sh`（exec 時のシェル）へ改訂＝ADR-001、docs アクセス 3 層（context7 MCP・docs egress）、`modern-web-guidance` 同梱。relay 下準備は撤去（#6、ADR-001 改訂）
- 2026-08-22 サンドボックス（node 24、Playwright 1.62.1、host port 5573）・docs・ADR-001 を整備、`RP_ID` / `ORIGIN` を shiraoka ホストへ（#4、#5）。okayus-skills v0.4.0 に passkey / space-invite / R2 の 3 skill を新設（本リポが最初の利用者）
- 2026-06 Cloudflare account subdomain 改名（`toshiaki-mukai-9981` → `shiraoka`）。本番 URL は `https://matatabetai.shiraoka.workers.dev`
- 2026-05-21 Walking Skeleton 本番稼働（#2）、`RP_ID` / `ORIGIN` を本番ホストに固定（#3）。D1 `matatabetai` 作成、空 migration 適用
- 2026-05-11 リポジトリ初期化・CLAUDE.md・main 直 commit 防止 hook（#1）

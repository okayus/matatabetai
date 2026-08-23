# いま（status hub）

<!-- 上限 40 行 / 3 KB。見出し 4 つは固定。終わった項目は消して docs/log.md の先頭へ（取り消し線は禁止）。
     8 行を超える節は docs/plans/<topic>.md に切り出す。更新は /handoff。
     セッション開始時に .claude/hooks/session-start.sh がこのファイルを注入する。 -->

## フェーズ

**基盤整備完了（2026-08-23）→ 実装着手前。** 本番 `https://matatabetai.shiraoka.workers.dev` は 5 月の歩く骨格（`/health` + SPA + 空 D1、GH Actions deploy）でロジック = ゼロ。設計は ADR-001、要件は requirements.md、段取りは roadmap.md。

## 次の 3 手

1. **人手の準備**（[plans/host-setup.md](plans/host-setup.md)）: PAT → 1Password → `./shell.sh`（2026-08-23 改訂: 注入は exec 時）、コンテナ内 claude ログイン、可視性 + ruleset、Workers Builds 接続、R2 bucket。済むまでコンテナは push できない
2. **ツールチェーン更新**（コンテナ内、`claude/chore-toolchain`）: wrangler 4 / `@cloudflare/vite-plugin` 1.x / pnpm 10 / node 24 / `wrangler types`。`ci.yml` は配備済み — PR で `ci` が緑になることを確認
3. **認証・スペース・招待**（skill `cloudflare-workers-passkey-auth` + `cloudflare-workers-space-membership-invite`）: 最初の migration から `spaces` / `space_members` / `invites`、`space_id NOT NULL`。UNVERIFIED を確認したらその場で skill を直す

## 詰まり・人手待ち

- 上記 1 の全項目。特に **private のままでは ruleset が効かず、main の保護は hook と deny だけ**（roadmap.md 決めること 3）

## 進行中 PR

- なし

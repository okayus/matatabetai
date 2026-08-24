# いま（status hub）

<!-- 上限 40 行 / 3 KB。見出し 4 つは固定。終わった項目は消して docs/log.md の先頭へ（取り消し線は禁止）。
     8 行を超える節は docs/plans/<topic>.md に切り出す。更新は /handoff。
     セッション開始時に .claude/hooks/session-start.sh がこのファイルを注入する。 -->

## フェーズ

**ツールチェーン更新完了（#10、2026-08-24）→ 認証実装の直前。** main は wrangler 4 / vite 8 / pnpm 11 / TS 7、バインディング型は `wrangler types` 生成の `Env`（gitignore。clone 直後と `wrangler.jsonc` 変更後は `pnpm types`）。**本番は #10 前のビルドのまま**（下記 deploy 失敗）。設計は ADR-001、要件は requirements.md、段取りは roadmap.md。

## 次の 3 手

1. **【ホスト】`deploy.yml` の pnpm 衝突を直す**（[plans/host-setup.md](plans/host-setup.md) 0）: `pnpm/action-setup@v4` の `version: 9.15.0` が `packageManager: pnpm@11.22.0` と衝突して Deploy が落ちる。直すまで **merge しても本番に届かない**
2. **【コンテナ】認証・スペース・招待**（skill `cloudflare-workers-passkey-auth` + `cloudflare-workers-space-membership-invite`）: 最初の migration から `spaces` / `space_members` / `invites`、`space_id NOT NULL`。UNVERIFIED を確認したらその場で skill を直す
3. **【ホスト】残りの人手準備**（[plans/host-setup.md](plans/host-setup.md)）: 可視性 + ruleset → Workers Builds 接続（繋げば `deploy.yml` ごと不要）→ R2 bucket

## 詰まり・人手待ち

- `.github/workflows/**` は token に `workflows` 権限が無く、コンテナからは直せない（上記 1・両 workflow の node 24 化）
- **private のままでは ruleset が効かず、main の保護は hook と deny だけ**（roadmap.md 決めること 3）
- **ドメイン**（roadmap.md 決めること 4）は passkey を 1 つでも登録する前に決める＝上記 2 を本番に出す前が期限

## 進行中 PR

- なし

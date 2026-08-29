# いま（status hub）

<!-- 上限 40 行 / 3 KB。見出し 4 つは固定。終わった項目は消して docs/log.md の先頭へ（取り消し線は禁止）。
     8 行を超える節は docs/plans/<topic>.md に切り出す。更新は /handoff。
     セッション開始時に .claude/hooks/session-start.sh がこのファイルを注入する。 -->

## フェーズ

**CI/CD の摩擦解消（#12–#14、2026-08-24）→ 認証実装の直前。** main は wrangler 4 / vite 8 / pnpm 11 / TS 7 で**本番も追随済み**（#12）。ci.yml は安定シェル（CI の中身は `package.json` の `ci` script と `.node-version` — コンテナから変更可、#13）。merge は `gh pr merge --auto --squash` の opt-in（例外あり、CLAUDE.md）。設計は ADR-001、要件は requirements.md、段取りは roadmap.md。

## 次の 3 手

1. **【ホスト】ruleset 2 本を作成**（[plans/host-setup.md](plans/host-setup.md) 1）: public 化済みなのに ruleset 未作成 = main がサーバー側で無防備。2 コマンド。auto-merge 運用はこれが前提
2. **【コンテナ】認証・スペース・招待**（skill `cloudflare-workers-passkey-auth` + `cloudflare-workers-space-membership-invite`）: 最初の migration から `spaces` / `space_members` / `invites`、`space_id NOT NULL`。UNVERIFIED を確認したらその場で skill を直す
3. **【ホスト】Workers Builds 接続**（[plans/host-setup.md](plans/host-setup.md) 4）: 繋げば `deploy.yml` と GitHub secrets を撤去できる → R2 bucket（同 5）

## 詰まり・人手待ち

- `.github/workflows/**` の yaml 自体は token で push 不可のまま（通常の CI 変更は安定シェル化で不要に。action 更新は Dependabot）
- **ドメイン**（roadmap.md 決めること 4）は passkey を 1 つでも登録する前に決める＝上記 2 を本番に出す前が期限

## 進行中 PR

- #13（ci 安定シェル化）・#14（docs 同期と merge 方針 — この PR）。merge されたら「なし」へ

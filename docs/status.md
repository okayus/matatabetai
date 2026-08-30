# いま（status hub）

<!-- 上限 40 行 / 3 KB。見出し 4 つは固定。終わった項目は消して docs/log.md の先頭へ（取り消し線は禁止）。
     8 行を超える節は docs/plans/<topic>.md に切り出す。更新は /handoff。
     セッション開始時に .claude/hooks/session-start.sh がこのファイルを注入する。 -->

## フェーズ

**CI/CD の摩擦解消が完了（#12–#17 + ruleset、2026-08-30）→ 認証実装へ。** main は `protect-main` ruleset（PR 必須 + required check `ci` + bypass なし）で保護、本番は最新 main。ci.yml は安定シェル（CI の中身は `package.json` の `ci` script と `.node-version` — コンテナから変更可）。merge はエージェントが `gh pr merge --auto --squash` で arm（PAT で実証済み。例外は CLAUDE.md）。設計は ADR-001、要件は requirements.md、段取りは roadmap.md。

## 次の 3 手

1. **【コンテナ】認証・スペース・招待**（skill `cloudflare-workers-passkey-auth` + `cloudflare-workers-space-membership-invite` + `cloudflare-d1-drizzle-migration`）: 最初の migration から `spaces` / `space_members` / `invites`、`space_id NOT NULL`。UNVERIFIED を確認したらその場で skill を直す。migration を含む PR は arm せず人間 merge（PR 本文に backup 手順）
2. **【判断】ドメイン**（roadmap.md 決めること 4）: workers.dev のままか custom domain か。passkey を 1 つでも登録する前＝上記 1 を本番に出す前が期限。workers.dev のままなら作業なし
3. **【ホスト】Workers Builds 接続**（[plans/host-setup.md](plans/host-setup.md) 4）: 繋げば `deploy.yml` と GitHub secrets を撤去できる → R2 bucket（同 5、写真実装まで不要）

## 詰まり・人手待ち

- `.github/workflows/**` の yaml 自体は token で push 不可のまま（通常の CI 変更は安定シェル化で不要に。action 更新は Dependabot）

## 進行中 PR

- なし

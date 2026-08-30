# いま（status hub）

<!-- 上限 40 行 / 3 KB。見出し 4 つは固定。終わった項目は消して docs/log.md の先頭へ（取り消し線は禁止）。
     8 行を超える節は docs/plans/<topic>.md に切り出す。更新は /handoff。
     セッション開始時に .claude/hooks/session-start.sh がこのファイルを注入する。 -->

## フェーズ

**認証・スペース・招待を実装して PR #19（2026-08-30）→ 人間 merge → 本番 secret とドメイン判断 → Phase 2（記録機能）へ。** main は `protect-main` ruleset で保護、CI は check + test + build（`pnpm run ci`）、e2e はコンテナ内で手動。設計は ADR-001 / ADR-002、要件は requirements.md、段取りは roadmap.md。

## 次の 3 手

1. **【ホスト】#19 の merge**（`drizzle/` を含むので人間 merge、auto-merge は arm していない）: merge 前に `SESSION_SECRET` put + backup（[plans/host-setup.md](plans/host-setup.md) 6、PR 本文）→ Deploy 後に `/health` と `register/begin` = `registration_closed` を確認。okayus-skills の還元（passkey-auth 0.2.0 / space-membership-invite 0.2.0 / e2e-playwright 0.2.1）を `cd ../okayus-skills` で commit
2. **【判断】ドメイン**（roadmap 決めること 4）: workers.dev のままか custom domain か。初回 owner 登録（host-setup 6 の `INITIAL_REGISTRATION_TOKEN` サイクル）の前が期限。workers.dev のままなら作業なし
3. **【コンテナ】Phase 2 記録機能**: `meals` / `tags` / `meal_tags` / またたべたい の migration 0002（`space_id NOT NULL`、requirements.md 設計メモ、`cloudflare-d1-drizzle-migration` 必読）→ 投稿・一覧 UI → e2e golden path に投稿を足す。Workers Builds 接続（host-setup 4）は人手の空きで

## 詰まり・人手待ち

- #19 は人間 merge 待ち。merge 前の secret 投入と backup もホスト作業
- `.github/workflows/**` の yaml 自体は token で push 不可のまま（通常の CI 変更は安定シェル化で不要に。action 更新は Dependabot）

## 進行中 PR

- #19 feat: passkey 認証・スペース・招待リンク（migration 0001）— CI 待ち → 人間 merge

# いま（status hub）

<!-- 上限 40 行 / 3 KB。見出し 4 つは固定。終わった項目は消して docs/log.md の先頭へ（取り消し線は禁止）。
     8 行を超える節は docs/plans/<topic>.md に切り出す。更新は /handoff。
     セッション開始時に .claude/hooks/session-start.sh がこのファイルを注入する。 -->

## フェーズ

**#19 merge・本番稼働（2026-08-30: passkey 認証・スペース・招待、migration 0001 適用、`SESSION_SECRET` 投入済み、登録の扉は閉じたまま）→ ドメイン判断 → 初回 owner 登録 → Phase 2（記録機能）へ。** main は `protect-main` ruleset で保護、CI は check + test + build、e2e はコンテナ内で手動。設計は ADR-001 / ADR-002、要件は requirements.md、段取りは roadmap.md。

## 次の 3 手

1. **【判断】ドメイン**（roadmap 決めること 4）: workers.dev のままか custom domain か。初回 owner 登録の前が期限（passkey 登録後のホスト変更は破壊的）。workers.dev のままなら作業なし
2. **【ホスト】初回 owner 登録**（[plans/host-setup.md](plans/host-setup.md) 6）: `INITIAL_REGISTRATION_TOKEN` を put → `/register` → delete → 2 台目のパスキー → 家族を招待。ホストの wrangler は `packages/web/node_modules/.bin/wrangler`（`pnpm exec` は不可 — local-dev.md）
3. **【コンテナ】Phase 2 記録機能**: `meals` / `tags` / `meal_tags` / またたべたい の migration 0002（`space_id NOT NULL`、requirements.md 設計メモ、`cloudflare-d1-drizzle-migration` 必読）→ 投稿・一覧 UI → e2e golden path に投稿を足す。Workers Builds 接続（host-setup 4）は人手の空きで

## 詰まり・人手待ち

- okayus-skills への還元（passkey-auth 0.2.0 / space-membership-invite 0.2.0 / e2e-playwright 0.2.1 / docker-sandbox 0.6.1）はホストで `cd ../okayus-skills` して commit / PR
- `.github/workflows/**` の yaml 自体は token で push 不可のまま（通常の CI 変更は安定シェル化で不要に。action 更新は Dependabot）

## 進行中 PR

- なし

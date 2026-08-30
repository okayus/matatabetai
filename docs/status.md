# いま（status hub）

<!-- 上限 40 行 / 3 KB。見出し 4 つは固定。終わった項目は消して docs/log.md の先頭へ（取り消し線は禁止）。
     8 行を超える節は docs/plans/<topic>.md に切り出す。更新は /handoff。
     セッション開始時に .claude/hooks/session-start.sh がこのファイルを注入する。 -->

## フェーズ

**Phase 1（認証と境界）はコードが本番稼働（#19、2026-08-30。登録の扉は `registration_closed` のまま、skill 還元済み）。残るのはドメイン判断と初回 owner 登録の人手作業。次は Phase 2（記録機能）。** main は `protect-main` ruleset で保護、CI は check + test + build、e2e はコンテナ内で手動。設計は ADR-001 / ADR-002、要件は requirements.md、段取りは roadmap.md。

## 次の 3 手

1. **【コンテナ】Phase 2 記録機能**: `meals` / `tags` / `meal_tags` / またたべたい の migration 0002（`space_id NOT NULL`、requirements.md 設計メモ、`cloudflare-d1-drizzle-migration` 必読。`drizzle/` を含むので人間 merge）→ 投稿・一覧 UI（書く前に `modern-web-guidance`）→ e2e golden path に投稿を足す。ドメイン判断とは独立に進められる
2. **【判断】ドメイン**（roadmap 決めること 4）: workers.dev のままか custom domain か。初回 owner 登録の前が期限（passkey 登録後のホスト変更は破壊的）。workers.dev のままなら作業なし
3. **【ホスト】初回 owner 登録**（[plans/host-setup.md](plans/host-setup.md) 6）: `INITIAL_REGISTRATION_TOKEN` を put → `/register` → delete → 2 台目のパスキー → 家族を招待。ホストの wrangler は `packages/web/node_modules/.bin/wrangler`（`pnpm exec` は不可 — local-dev.md）。その後 Workers Builds 接続（host-setup 4）

## 詰まり・人手待ち

- `.github/workflows/**` の yaml 自体は token で push 不可のまま（通常の CI 変更は安定シェル化で不要に。action 更新は Dependabot）

## 進行中 PR

- なし

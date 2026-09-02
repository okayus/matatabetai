# いま（status hub）

<!-- 上限 40 行 / 3 KB。見出し 4 つは固定。終わった項目は消して docs/log.md の先頭へ（取り消し線は禁止）。
     8 行を超える節は docs/plans/<topic>.md に切り出す。更新は /handoff。
     セッション開始時に .claude/hooks/session-start.sh がこのファイルを注入する。 -->

## フェーズ

**Phase 2（記録できる / MVP）完了 — 記録・写真・サジェストが本番稼働（#22 / #27 / #29、ADR-003〜005）。次は Phase 3（振り返れる）。** main は `protect-main` ruleset で保護、CI は check + test + build、e2e はコンテナ内で手動（`pnpm e2e` 7 passed）。設計は ADR-001〜005、要件は requirements.md、段取りは roadmap.md。

## 次の 3 手

1. **【コンテナ】Phase 3 第一弾 — またたべたい一覧・料理名の期間集計・タグ検索（AND）**（roadmap Phase 3、requirements 6/7）: クエリは requirements「主要クエリ」が正典。タグ語彙は #29 の `GET /api/spaces/:spaceId/tags`、AND 絞り込みは `listSuggestions` と同じ `having count(distinct tag_id) = N` を使い回す。集計は `name_normalized` で `GROUP BY`
2. **【ホスト】Workers Builds 接続**（[plans/host-setup.md](plans/host-setup.md) 4）: dash の儀式 → `deploy.yml` 削除 PR（人手 push）→ secrets と旧トークンの退役。dash 生成トークンは D1 / R2 Edit を含む（skill `cloudflare-workers-builds-keyless-deploy` 0.3.0）
3. **【コンテナ】レシピ URL の OGP 表示**（roadmap Phase 3、requirements「決めていないこと」）: `HTMLRewriter` で取得、hotlink はしない。okayus-skills の新 skill 候補

## 詰まり・人手待ち

- **okayus-skills が未 commit**: `cloudflare-workers-e2e-playwright` 0.3.0（golden path の locator の罠 2 つを還元）。ホストで `cd ../okayus-skills` → `feat(cloudflare-workers-e2e-playwright): …`
- **サジェストの実機確認が未**: 札は記録が数件ないと出ない（スマホから何品か入れて横スクロールの札を確認する）
- `.github/workflows/**` の yaml 自体は token で push 不可のまま（通常の CI 変更は安定シェル化で不要に。action 更新は Dependabot）

## 進行中 PR

- なし

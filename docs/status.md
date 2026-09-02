# いま（status hub）

<!-- 上限 40 行 / 3 KB。見出し 4 つは固定。終わった項目は消して docs/log.md の先頭へ（取り消し線は禁止）。
     8 行を超える節は docs/plans/<topic>.md に切り出す。更新は /handoff。
     セッション開始時に .claude/hooks/session-start.sh がこのファイルを注入する。 -->

## フェーズ

**Phase 3（振り返れる）進行中 — 第一弾のふりかえり /lookback（#31・ADR-006）が本番稼働、記録系は Phase 2 完了（#22 / #27 / #29）。第二弾のレシピ・リンク欄再設計 + URL プレビューは ADR-007（#37）で確定。** deploy は Workers Builds（#33、`main` push 起動）、main は `protect-main` ruleset 保護、CI は check + test + build、e2e はコンテナ内で手動。設計 ADR-001〜007、要件 requirements.md、段取り roadmap.md。

## 次の 3 手

1. **【コンテナ】実装 PR ①（ADR-007 §1-2）**: additive migration で `recipe_url` / `shop_url` 追加 + 旧 `url` を一律 `recipe_url` に backfill（CHECK 凍結、rebuild しない）。フォームを排他ドロップダウン → 独立 3 項目、`applySuggestion` も 3 項目に。**backup は取らない**（データ少・additive、ユーザー決定 2026-09-03）。`drizzle/` なので人間 merge
2. **【コンテナ】実装 PR ②（ADR-007 §3-7）**: `meal_link_previews` migration + OGP 取得（`waitUntil` + `HTMLRewriter`、og:image は private R2）+ カード表示（失敗はプレーンリンク）+ e2e（固定 HTML で成功 / 失敗の 2 点）
3. **【コンテナ】週 / 月の集計 UI とタグクラウド**（roadmap Phase 3 残り）: API は #31 の `/meals/stats?from&to` のまま（プリセットが期間を組む）

## 詰まり・人手待ち

- **【人間】レシピ本文取り込み（ADR-008 候補）の前提**: cookpad 等の利用規約の原文をホストのブラウザで確認（サンドボックスは egress 制限で取れない）。JSON-LD `schema.org/Recipe` 路線が本命
- **スマホ実機確認が未**: サジェストの札（記録が数件ないと出ない）と #31 のふりかえり（♥ 既定・タグ絞り込み・集計）
- `.github/workflows/**` は token で push 不可（残り `ci.yml` 1 本、action 更新は Dependabot）

## 進行中 PR

- なし（#37 は merge 済み。次は実装 PR ①）

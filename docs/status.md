# いま（status hub）

<!-- 上限 40 行 / 3 KB。見出し 4 つは固定。終わった項目は消して docs/log.md の先頭へ（取り消し線は禁止）。
     8 行を超える節は docs/plans/<topic>.md に切り出す。更新は /handoff。
     セッション開始時に .claude/hooks/session-start.sh がこのファイルを注入する。 -->

## フェーズ

**Phase 3（振り返れる）進行中 — ふりかえり /lookback（#31・ADR-006）とレシピ・リンクの独立 3 項目化（#39・ADR-007 §1-2）が本番稼働。記録系は Phase 2 完了。残りは URL プレビュー（ADR-007 §3-7）と週 / 月の集計 UI。** deploy は Workers Builds（`main` push 起動）、main は `protect-main` ruleset 保護、CI は check + test + build、e2e はコンテナ内で手動。設計 ADR-001〜007、要件 requirements.md、段取り roadmap.md。

## 次の 3 手

1. **【コンテナ】実装 PR ②（ADR-007 §3-7）**: `meal_link_previews` migration + OGP 取得（`waitUntil` + `HTMLRewriter`、og:image は private R2 `ogp/<spaceId>/<mealId>/<kind>`）+ カード表示（`MealList` の種別つき `<a>` に重ね、`pending` / `failed` はプレーンリンクのまま）+ e2e（wrangler dev が配る固定 HTML で成功 / 失敗の 2 点）。`drizzle/` なので人間 merge
2. **【コンテナ】週 / 月の集計 UI とタグクラウド**（roadmap Phase 3 残り）: API は #31 の `/meals/stats?from&to` のまま（プリセットが期間を組む）
3. **【コンテナ】Phase 4 の D1 バックアップ整備**（skill `cloudflare-d1-weekly-backup-via-pr` の keyless 変種 — public リポなので git commit 変種は不可）。済めば ADR-007 §2 の凍結列（`recipe_source_type` / `url`）を rebuild で掃除できる

## 詰まり・人手待ち

- **【人間】旧 `url` 投稿の仕分け**: #39 の backfill は一律 `recipe_url`。お店・商品の URL だった投稿は本番 D1 で手 SQL（`UPDATE meals SET shop_url = recipe_url, recipe_url = NULL WHERE id = …`）— サンドボックスからは本番 D1 を引けない
- **【人間】レシピ本文取り込み（ADR-008 候補）の前提**: cookpad 等の利用規約の原文をホストのブラウザで確認（サンドボックスは egress 制限で取れない）。JSON-LD `schema.org/Recipe` 路線が本命
- **スマホ実機確認が未**: サジェストの札（記録が数件ないと出ない）・#31 のふりかえり・#39 の 3 項目フォーム
- `.github/workflows/**` は token で push 不可（残り `ci.yml` 1 本、action 更新は Dependabot）

## 進行中 PR

- なし（#39 は merge 済み・本番稼働。次は実装 PR ②）

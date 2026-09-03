# いま（status hub）

<!-- 上限 40 行 / 3 KB。見出し 4 つは固定。終わった項目は消して docs/log.md の先頭へ（取り消し線は禁止）。
     8 行を超える節は docs/plans/<topic>.md に切り出す。更新は /handoff。
     セッション開始時に .claude/hooks/session-start.sh がこのファイルを注入する。 -->

## フェーズ

**Phase 3（振り返れる）— ADR-007 は §1-7 すべて本番稼働（#39 の 3 項目化 + #41 の URL プレビュー）。残りは週 / 月の集計 UI とタグクラウドだけ。** deploy は Workers Builds（`main` push 起動）、main は `protect-main` ruleset 保護、CI は check + test + build、e2e はコンテナ内で手動（4 spec）。設計 ADR-001〜007、要件 requirements.md、段取り roadmap.md。

## 次の 3 手

1. **【コンテナ】週 / 月の集計 UI とタグクラウド**（roadmap Phase 3 の残り）: API は #31 の `/meals/stats?from&to` のまま（プリセットが期間を組む）。migration なしで書けるはず
2. **【コンテナ】Phase 4 の D1 バックアップ整備**（skill `cloudflare-d1-weekly-backup-via-pr` の keyless 変種 — public リポなので git commit 変種は不可）。済めば ADR-007 §2 の凍結列（`recipe_source_type` / `url`）を rebuild で掃除できる
3. **【コンテナ】bot scan 対策と認証 route のレート制限**（skill `cloudflare-workers-bot-scan-defense`）。#41 で「任意 URL を Worker が取りに行く」経路ができたので、その濫用対策もここに乗せる（ADR-007 §6 が Phase 4 へ送った分）

## 詰まり・人手待ち

- **【人間】#41 の実サイト確認**: サンドボックスは egress 制限で外に出られず、実レシピサイトで OGP が取れるかは未検証。本番でレシピ URL を貼って投稿 → 一覧を読み直してカードが出るか。落ちる URL は `wrangler tail` に `[link-preview] fetch failed <host>`
- **【人間】旧 `url` 投稿の仕分け**: #39 の backfill は一律 `recipe_url`。お店・商品の URL だった投稿は本番 D1 で手 SQL（`UPDATE meals SET shop_url = recipe_url, recipe_url = NULL WHERE id = …`）— サンドボックスからは本番 D1 を引けない
- **【人間】レシピ本文取り込み（ADR-008 候補）の前提**: cookpad 等の利用規約の原文をホストのブラウザで確認。JSON-LD `schema.org/Recipe` 路線が本命で、取得の配線は #41 で入ったので `script[type="application/ld+json"]` を足す形になる
- **スマホ実機確認が未**: サジェストの札（記録が数件ないと出ない）・#31 のふりかえり・#39 の 3 項目フォーム・#41 のプレビューカード
- `.github/workflows/**` は token で push 不可（残り `ci.yml` 1 本、action 更新は Dependabot）

## 進行中 PR

- なし（#41 は merge 済み・本番稼働。次は週 / 月の集計 UI）

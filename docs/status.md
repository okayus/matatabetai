# いま（status hub）

<!-- 上限 40 行 / 3 KB。見出し 4 つは固定。終わった項目は消して docs/log.md の先頭へ（取り消し線は禁止）。
     8 行を超える節は docs/plans/<topic>.md に切り出す。更新は /handoff。
     セッション開始時に .claude/hooks/session-start.sh がこのファイルを注入する。 -->

## フェーズ

**Phase 3（振り返れる）完了 — #44 で週 / 月の集計プリセットとタグクラウドが本番稼働し、Phase 3 は全部埋まった。ここから Phase 4（公開前の堅牢化）。** deploy は Workers Builds（`main` push 起動）、main は `protect-main` 保護、CI は check + test + build、e2e はコンテナ内で手動（4 spec）。設計 ADR-001〜007、段取り roadmap.md。

## 次の 3 手

1. **【コンテナ】D1 バックアップ整備**（skill `cloudflare-d1-weekly-backup-via-pr` の keyless 変種 — public リポなので git commit 変種は不可）。済めば ADR-007 §2 の凍結列（`recipe_source_type` / `url`）を rebuild で掃除できる
2. **【コンテナ】bot scan 対策と認証 route のレート制限**（skill `cloudflare-workers-bot-scan-defense`）。#41 の「任意 URL を Worker が取りに行く」経路の濫用対策もここに乗せる（ADR-007 §6 が Phase 4 へ送った分）
3. **【コンテナ】日本語の部分一致検索**（いまは `LIKE '%…%'`。D1 で FTS5 の trigram tokenizer が使えるか確認 → ADR）。ADR-006 の「集計行タップで履歴へ」はこれ待ち

## 詰まり・人手待ち

- **【人間】#41 の実サイト確認**: サンドボックスは egress 制限で実レシピサイトを試せない。本番でレシピ URL を貼って投稿 → 一覧を読み直しカードが出るか。落ちる URL は `wrangler tail` に `[link-preview] fetch failed <host>`
- **【人間】旧 `url` 投稿の仕分け**: #39 の backfill は一律 `recipe_url`。お店・商品の URL だった投稿は本番 D1 で手 SQL（`UPDATE meals SET shop_url = recipe_url, recipe_url = NULL WHERE id = …`。サンドボックスからは引けない）
- **【人間】レシピ本文取り込み（ADR-008 候補）の前提**: cookpad 等の利用規約の原文をホストのブラウザで確認。JSON-LD `schema.org/Recipe` 路線が本命で、取得の配線は #41 済み（`script[type="application/ld+json"]` を足す形）
- **スマホ実機確認が未**: サジェストの札（記録が数件ないと出ない）・#39 の 3 項目フォーム・#41 のプレビューカード・#44 のふりかえり（札の当たり判定、ステッパー連打、クラウドから飛んだ先の位置）
- `.github/workflows/**` は token で push 不可（残り `ci.yml` 1 本、action 更新は Dependabot）

## 進行中 PR

- なし（#44 は merge 済み・本番稼働）

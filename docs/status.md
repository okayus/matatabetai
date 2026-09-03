# いま（status hub）

<!-- 上限 40 行 / 3 KB。見出し 4 つは固定。終わった項目は消して docs/log.md の先頭へ（取り消し線は禁止）。
     8 行を超える節は docs/plans/<topic>.md に切り出す。更新は /handoff。
     セッション開始時に .claude/hooks/session-start.sh がこのファイルを注入する。 -->

## フェーズ

**Phase 3（振り返れる）を再開 — 投稿の編集・写真カルーセル・写真グリッドを requirements 11-13 に追加（2026-09-03 のユーザ指示で最優先）。Phase 4（D1 バックアップ・bot scan 対策・部分一致検索）は後回し。** deploy は Workers Builds（`main` push 起動）、main は `protect-main` 保護、CI は check + test + build、e2e はコンテナ内で手動（4 spec）。設計 ADR-001〜007、段取り roadmap.md。

## 次の 3 手

1. **【コンテナ】投稿の編集（requirements 11）— まず ADR を起草する**: 何を直せるか（料理名 / 日付 / タイミング / タグ / リンク 3 項目 / メモ / 写真の足し引き）、`PATCH /meals/:id` の形（いまは またたべたい 専用）、URL を貼り替えたとき `meal_link_previews` を取り直すか、誰が直せるか。migration は要らない見込み
2. **【コンテナ】写真のカルーセル（requirements 12）**: 複数枚を切り替えて見られるように。いまは thumb の strip + lightbox（`MealList`）。API 変更なしの表示だけ
3. **【コンテナ】写真グリッドのタイムライン（requirements 13）**: 写真だけを並べた見方を足す。写真の無い投稿の扱い・並び・件数（一覧は LIMIT 50）とセルの飛び先を決める

## 詰まり・人手待ち

- **【人間】#41 の実サイト確認**: サンドボックスは egress 制限で実レシピサイトを試せない。本番でレシピ URL を貼って投稿 → 一覧を読み直しカードが出るか。落ちれば `wrangler tail` に `[link-preview] fetch failed <host>`
- **【人間】旧 `url` 投稿の仕分け**: #39 の backfill は一律 `recipe_url`。お店・商品の URL だった投稿は本番 D1 で手 SQL（`UPDATE meals SET shop_url = recipe_url, recipe_url = NULL WHERE id = …`。サンドボックスからは引けない）
- **【人間】レシピ本文取り込みの前提**（順位は 3 件の後ろ）: cookpad 等の利用規約の原文をホストのブラウザで確認。JSON-LD `schema.org/Recipe` 路線が本命で、取得の配線は #41 済み
- **スマホ実機確認が未**: サジェストの札（記録が数件ないと出ない）・#39 の 3 項目フォーム・#41 のプレビューカード・#44 のふりかえり（札の当たり判定・ステッパー連打・飛んだ先の位置）
- `.github/workflows/**` は token で push 不可（残り `ci.yml` 1 本、action 更新は Dependabot）

## 進行中 PR

- なし

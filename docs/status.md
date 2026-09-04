# いま（status hub）

<!-- 上限 40 行 / 3 KB。見出し 4 つは固定。終わった項目は消して docs/log.md の先頭へ（取り消し線は禁止）。
     8 行を超える節は docs/plans/<topic>.md に切り出す。更新は /handoff。
     セッション開始時に .claude/hooks/session-start.sh がこのファイルを注入する。 -->

## フェーズ

**Phase 3（振り返れる）を継続 — requirements 11（投稿の編集）は #47-49、12（写真のカルーセル）は #51 で本番稼働。残るは 13（写真グリッド）。Phase 4（D1 バックアップ・bot scan 対策・部分一致検索）は後回し。** deploy は Workers Builds（`main` push 起動）、main は `protect-main` 保護、CI は check + test + build、e2e はコンテナ内で手動（4 spec）。設計 ADR-001〜008、段取り roadmap.md。

## 次の 3 手

1. **【コンテナ】写真グリッドのタイムライン（requirements 13）**: 写真だけを並べた見方。写真の無い投稿の扱い・並び・件数（一覧は LIMIT 50）・セルの飛び先と、一覧 API を使い回せるかを決める。グリッドはサムネ（320px）を使う — カードの写真は #51 で本体 1600px に変えた
2. **【コンテナ】Phase 4 の入口 — D1 バックアップ**: skill `cloudflare-d1-weekly-backup-via-pr` の keyless 変種（GitHub に Cloudflare の credential が無いので、skill のままでは動かない）
3. **【コンテナ】Phase 4 の続き**: bot scan 対策（skill あり）→ 日本語の部分一致検索

## 詰まり・人手待ち

- **【人間】#41 の実サイト確認**: サンドボックスは egress 制限で実レシピサイトを試せない。本番でレシピ URL を貼って投稿 → 一覧を読み直しカードが出るか。落ちれば `wrangler tail` に `[link-preview] fetch failed <host>`
- **【人間】旧 `url` 投稿の仕分け**: #39 の backfill は一律 `recipe_url`。お店・商品の URL だった投稿は **#49 の編集 UI で直せる**（手 SQL は不要になった）
- **【人間】レシピ本文取り込みの前提**（順位は 3 件の後ろ）: cookpad 等の利用規約の原文をホストのブラウザで確認。JSON-LD `schema.org/Recipe` 路線が本命で、取得の配線は #41 済み
- **スマホ実機確認が未**: サジェストの札・#39 の 3 項目フォーム・#41 のプレビューカード・#44 のふりかえり・#49 の編集・**#51 のカルーセル（スワイプの手応え＝ snap が強すぎないか・1 枚投稿の縦の大きさ＝ いまは 60dvh で止めている・本体 1600px にした一覧の重さ）**
- `.github/workflows/**` は token で push 不可（残り `ci.yml` 1 本、action 更新は Dependabot）

## 進行中 PR

- なし

# いま（status hub）

<!-- 上限 40 行 / 3 KB。見出し 4 つは固定。終わった項目は消して docs/log.md の先頭へ（取り消し線は禁止）。
     8 行を超える節は docs/plans/<topic>.md に切り出す。更新は /handoff。
     セッション開始時に .claude/hooks/session-start.sh がこのファイルを注入する。 -->

## フェーズ

**Phase 3（振り返れる）を再開 — requirements 14（投稿フォームのダイアログ化）・15（写真ファーストのトップページ）を 2026-09-05 に追加（ユーザ指示）。11-13 は本番稼働済み、Phase 4（D1 バックアップ・bot scan 対策・部分一致検索）はさらに後回し。** deploy は Workers Builds（`main` push 起動）、main は `protect-main` 保護、CI は check + test + build、e2e はコンテナ内で手動（4 spec）。設計 ADR-001〜008、段取り roadmap.md。

## 次の 3 手

1. **【コンテナ】投稿フォームのダイアログ化（requirements 14）**: トップの投稿ボタン → `<dialog>` でフォーム（中身は `MealFields` + サジェストごと移す）。あわせてタイムラインの既定を「写真だけ」に（requirements 15 の前半・1 行）
2. **【コンテナ】トップページを検索 + 投稿済み写真に（requirements 15 の後半）**: どの検索を置くか（ふりかえりのタグ・♥ 絞り込みをホームへ / 料理名部分一致の前倒し）、ふりかえりとの役割分担、スペース節の置き場を決めてから作る
3. **【コンテナ】Phase 4 の入口 — D1 バックアップ**: skill `cloudflare-d1-weekly-backup-via-pr` の keyless 変種（GitHub に Cloudflare credential なし。git に積む案の可否も再検討）

## 詰まり・人手待ち

- **【人間】#41 の実サイト確認**: 本番でレシピ URL を貼って投稿 → 一覧を読み直しカードが出るか（sandbox は egress 制限で試せない）。落ちれば `wrangler tail` に `[link-preview] fetch failed <host>`
- **【人間】旧 `url` 投稿の仕分け**: #39 の backfill は一律 `recipe_url`。お店・商品の URL だった投稿は #49 の編集 UI で直せる
- **【人間】レシピ本文取り込みの前提**: cookpad 等の利用規約の原文をホストのブラウザで確認。JSON-LD `schema.org/Recipe` 路線が本命で、取得の配線は #41 済み
- **スマホ実機確認が未**: サジェストの札・#39 の 3 項目フォーム・#41 のプレビューカード・#44 のふりかえり・#49 の編集・#51 のカルーセル（snap の強さ・1 枚投稿の 60dvh・本体 1600px の重さ）・#53 の写真グリッド（セル最小 6rem のタップしやすさ・複数枚アイコンの見え方）
- `.github/workflows/**` は token で push 不可（残り `ci.yml` 1 本、action 更新は Dependabot）

## 進行中 PR

- なし

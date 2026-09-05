# いま（status hub）

<!-- 上限 40 行 / 3 KB。見出し 4 つは固定。終わった項目は消して docs/log.md の先頭へ（取り消し線は禁止）。
     8 行を超える節は docs/plans/<topic>.md に切り出す。更新は /handoff。
     セッション開始時に .claude/hooks/session-start.sh がこのファイルを注入する。 -->

## フェーズ

**Phase 3（振り返れる）の残りは requirements 15 の後半（トップを検索 + 投稿済み写真に）だけ。14 と 15 の前半（既定を写真だけに）は #56 で本番稼働（2026-09-05）。Phase 4（D1 バックアップ・bot scan・部分一致検索）はその後。** deploy は Workers Builds（`main` push 起動）、main は `protect-main` 保護、CI は check + test + build、e2e はコンテナ内で手動（4 spec）。設計 ADR-001〜008、段取り roadmap.md。

## 次の 3 手

1. **【コンテナ】トップページを検索 + 投稿済み写真に（requirements 15 の後半）**: 先に決める — ①ホームに置く検索（ふりかえりのタグ・♥ 絞り込みを持ってくる / 料理名の部分一致 `LIKE` を前倒し）②ふりかえりとの役割分担 ③挨拶 h1 とスペース節の置き場。決めたら小さく作る（API が要るのは部分一致だけ）
2. **【コンテナ】Phase 4 の入口 — D1 バックアップ**: skill `cloudflare-d1-weekly-backup-via-pr` の keyless 変種（GitHub に Cloudflare credential なし。git に積む案の可否も再検討）
3. **【コンテナ】bot scan 対策**: skill `cloudflare-workers-bot-scan-defense` — 認証 route（begin / verify）のレート制限と observability

## 詰まり・人手待ち

- **【人間】#41 の実サイト確認**: 本番でレシピ URL を貼って投稿 → 一覧を読み直しカードが出るか（sandbox は egress 制限で試せない）。落ちれば `wrangler tail` に `[link-preview] fetch failed <host>`
- **【人間】旧 `url` 投稿の仕分け**: #39 の backfill は一律 `recipe_url`。お店・商品の URL だった投稿は #49 の編集 UI で直せる
- **【人間】レシピ本文取り込みの前提**: cookpad 等の利用規約の原文をホストのブラウザで確認。JSON-LD `schema.org/Recipe` 路線が本命で、取得の配線は #41 済み
- **スマホ実機確認が未**: サジェストの札・#39 の 3 項目フォーム・#41 のプレビューカード・#44 のふりかえり・#49 の編集・#51 のカルーセル（snap・1 枚投稿の 60dvh・1600px の重さ）・#53 のグリッド（セル 6rem・複数枚アイコン）・#56 のダイアログ（シート内スクロールが document に抜けないか・Android の戻る・閉じても下書きが残る感触）
- `.github/workflows/**` は token で push 不可（残り `ci.yml` 1 本、action 更新は Dependabot）

## 進行中 PR

- なし

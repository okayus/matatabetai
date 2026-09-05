# いま（status hub）

<!-- 上限 40 行 / 3 KB。見出し 4 つは固定。終わった項目は消して docs/log.md の先頭へ（取り消し線は禁止）。
     8 行を超える節は docs/plans/<topic>.md に切り出す。更新は /handoff。
     セッション開始時に .claude/hooks/session-start.sh がこのファイルを注入する。 -->

## フェーズ

**requirements 15 の後半（トップを検索 + 写真の壁に）は #58 で実装済み・人間 merge 待ち（ADR-009 同梱、2026-09-05）。merge で Phase 3 完了、次は Phase 4（D1 バックアップ・bot scan。部分一致は #58 の `?q=` で前倒し済み、残るは FTS5 化）。** deploy は Workers Builds（`main` push 起動）、main は `protect-main` 保護、CI は check + test + build、e2e はコンテナ内で手動（4 spec）。設計 ADR-001〜009、段取り roadmap.md。

## 次の 3 手

1. **【コンテナ】#58 の merge 後**: review の直しが出ればそれが先。merge されたら `gh run list` と本番 `/health` と配信 asset の一致で deploy を確認 → log に 1 行、roadmap の 15 を ✅
2. **【コンテナ】Phase 4 の入口 — D1 バックアップ**: skill `cloudflare-d1-weekly-backup-via-pr` の keyless 変種（GitHub に Cloudflare credential なし。git に積む案の可否も再検討）
3. **【コンテナ】bot scan 対策**: skill `cloudflare-workers-bot-scan-defense` — 認証 route（begin / verify）のレート制限と observability

## 詰まり・人手待ち

- **【人間】#58 の review と merge**: `docs/adr/**`（ADR-009）を含むので auto-merge しない。要点は ADR-009 と PR 本文
- **【人間】#41 の実サイト確認**: 本番でレシピ URL を貼って投稿 → 一覧を読み直しカードが出るか（sandbox は egress 制限で試せない）。落ちれば `wrangler tail` に `[link-preview] fetch failed <host>`
- **【人間】旧 `url` 投稿の仕分け**: #39 の backfill は一律 `recipe_url`。お店・商品の URL だった投稿は #49 の編集 UI で直せる
- **【人間】レシピ本文取り込みの前提**: cookpad 等の利用規約の原文をホストのブラウザで確認。JSON-LD `schema.org/Recipe` 路線が本命で、取得の配線は #41 済み
- **スマホ実機確認が未**: #39 の 3 項目フォーム・#41 のプレビューカード・#44 のふりかえり・#49 の編集・#51 のカルーセル（snap・60dvh）・#53 のグリッド・#56 のダイアログ（シート内スクロール・Android の戻る）・#58 の検索（検索キーで確定・× で解除・長いスペース名の折り返し）
- `.github/workflows/**` は token で push 不可（残り `ci.yml` 1 本、action 更新は Dependabot）

## 進行中 PR

- **#58** feat(home): 写真ファーストのトップページ（requirements 15 の後半）+ ADR-009 — CI green、人間 merge 待ち

# いま（status hub）

<!-- 上限 40 行 / 3 KB。見出し 4 つは固定。終わった項目は消して docs/log.md の先頭へ（取り消し線は禁止）。
     8 行を超える節は docs/plans/<topic>.md に切り出す。更新は /handoff。
     セッション開始時に .claude/hooks/session-start.sh がこのファイルを注入する。 -->

## フェーズ

**Phase 4（公開前の堅牢化）へ — Phase 3（振り返れる）は requirements 11-13 まで全部本番稼働（編集 #47-49・カルーセル #51・写真グリッド #53）。残るは D1 バックアップ・bot scan 対策・日本語部分一致検索。** deploy は Workers Builds（`main` push 起動）、main は `protect-main` 保護、CI は check + test + build、e2e はコンテナ内で手動（4 spec）。設計 ADR-001〜008、段取り roadmap.md。

## 次の 3 手

1. **【コンテナ】Phase 4 の入口 — D1 バックアップ**: skill `cloudflare-d1-weekly-backup-via-pr` の keyless 変種を設計する。GitHub に Cloudflare の credential が無い（Workers Builds 移行 #33 で撤去）ので skill のままでは動かず、public リポなので backup を git に積む案の可否も含めて再検討 → 方針が割れたら ADR
2. **【コンテナ】bot scan 対策**: skill `cloudflare-workers-bot-scan-defense`（認証 route のレート制限と観測。sandbox の rate-limit binding の罠は skill `playwright-e2e-in-docker-sandbox` に記録済み）
3. **【コンテナ】日本語の部分一致検索**: まず `LIKE '%…%'` で UI を付けるか、D1 の FTS5 trigram の可否を確かめてから決める（requirements 主要クエリ）

## 詰まり・人手待ち

- **【人間】#41 の実サイト確認**: サンドボックスは egress 制限で実レシピサイトを試せない。本番でレシピ URL を貼って投稿 → 一覧を読み直しカードが出るか。落ちれば `wrangler tail` に `[link-preview] fetch failed <host>`
- **【人間】旧 `url` 投稿の仕分け**: #39 の backfill は一律 `recipe_url`。お店・商品の URL だった投稿は #49 の編集 UI で直せる
- **【人間】レシピ本文取り込みの前提**: cookpad 等の利用規約の原文をホストのブラウザで確認。JSON-LD `schema.org/Recipe` 路線が本命で、取得の配線は #41 済み
- **スマホ実機確認が未**: サジェストの札・#39 の 3 項目フォーム・#41 のプレビューカード・#44 のふりかえり・#49 の編集・#51 のカルーセル（snap の強さ・1 枚投稿の 60dvh・本体 1600px の重さ）・**#53 の写真グリッド（セル最小 6rem のタップしやすさ — 誤タップが多ければ 2 列側に倒す・複数枚アイコンの見え方）**
- `.github/workflows/**` は token で push 不可（残り `ci.yml` 1 本、action 更新は Dependabot）

## 進行中 PR

- なし

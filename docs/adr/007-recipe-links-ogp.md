# ADR-007: レシピ・リンク欄の 3 項目化と URL プレビュー（OGP スナップショット）で確定した決定

- ステータス: 承認
- 日付: 2026-09-03

## コンテキスト

requirements 機能要件 3〜5 は「レシピ URL / 自作レシピ本文 / なし」の排他 1 択（`RecipeSource` DU、DB は ADR-003 §2 の CHECK `meals_recipe_source_check`）で、UI もドロップダウン切替だった。しかし実際の記録は「レシピ URL を貼りつつ自分のアレンジをメモしたい」「レシピ URL とお店・商品の URL は別物」で、排他が実態に合わない。Phase 3 の URL プレビュー（OGP）に着手するにあたり、プレビューが付く対象＝フィールド構造を先に確定する。

将来の「レシピ本文の取り込み」（JSON-LD `schema.org/Recipe` の材料・手順 → 作り方メモの下書き）はこの ADR に含めない。著作権上、材料・分量・手順はアイデアで保護対象外だが、説明文の創作的表現・写真は著作物になり得るし、対象サイトの利用規約の確認（サンドボックスの egress 制限で取得不可 — 人間がホストのブラウザで原文を読む）が先。Readability（html2md 方式）の全文抽出は jsdom 前提で Worker に載らない点でも本命にせず、調査後に別 ADR（008 候補）で決める。

## 決定

### 1. 排他をやめ、独立した任意 3 項目にする

`recipeUrl`（レシピ URL）/ `shopUrl`（お店・商品 URL）/ `recipeMemo`（作り方メモ、旧「自作レシピ」。列は `recipe_text` を再利用）。各 nullable・併用可、ドロップダウンは廃止。`note`（ひとことメモ）は従来どおり別: **3 項目は料理の属性なのでサジェストで引き継ぐ、note はその回のエピソードなので引き継がない**（ADR-005 §5 の意味論を 3 項目へ拡張）。既存 `url` の backfill は**一律 `recipe_url`**（店か商品かは機械判別できず件数も家族規模 — 違っていたら手 SQL で直す）。`RecipeSource` DU は削除する。

### 2. migration は additive — CHECK は外さず凍結する（rebuild 回避）

ADR-003 §2 は CHECK の不変を「安定」と判断したが、本 ADR で覆る。それでも CHECK を**外さない**: 外す＝table rebuild で、meals は meal_photos / meal_tags の親 — D1 は `PRAGMA foreign_keys=OFF` を無視するので CASCADE 事故に直結する（skill `cloudflare-d1-drizzle-migration`、ADR-003 §2 が meal_type に CHECK を付けなかったのと同じ理由）。代わりに:

- `ALTER TABLE meals ADD COLUMN recipe_url / shop_url`（nullable）だけを足す
- 書き込みは `recipe_source_type = recipe_text があれば 'text'、なければ 'none'`・`url = NULL` を導出して旧 CHECK を満たし続ける（`recipe_source_type` / `url` は凍結列）
- backfill: `UPDATE meals SET recipe_url = url, url = NULL, recipe_source_type = 'none' WHERE recipe_source_type = 'url'`（更新後も CHECK を満たす）
- 凍結列の掃除（rebuild）は Phase 4 の D1 バックアップ整備後に別 migration で

### 3. プレビューは投稿時スナップショット（表示時に取得しない）

POST /meals の応答後に `ctx.waitUntil` で取得する（URL 2 本 + 画像でも 30 秒制限に収まる。Workflows は過剰）。製品意図 1「振り返って思い出を楽しむ」にはリンク切れ耐性が本質で、カードは**投稿時点の姿**で保存し、表示時の外部依存をゼロにする。情報が古くなるのは思い出用途ではむしろ正。投稿を fetch 待ちでブロックしない。

### 4. 置き場は子テーブル `meal_link_previews` + private R2

`meal_link_previews (meal_id FK CASCADE, kind ('recipe'|'shop'), url, status ('pending'|'ok'|'failed'), title, description, site_name, image_r2_key, fetched_at, created_at)` PK(meal_id, kind)。子テーブル新設は additive で安全（meals を再び触らない）。行は投稿の INSERT と同じ batch で `pending` として作り、waitUntil が `ok` / `failed` に更新する。og:image は hotlink せず Worker が取得して private R2 へ — key は `ogp/<spaceId>/<mealId>/<kind>`（ADR-004 §3 のスキーム）、配信は既存の認可付き proxy（ADR-004 §1）、magic bytes 検査 + サイズ上限（5 MB 目安）だけでリサイズはしない。meal 削除時は写真と同じ R2 → D1 の順（ADR-004 §6）。

### 5. 失敗はプレーンリンク（プレビューはプログレッシブエンハンスメント）

URL は常に `<a>`（現行の `linkLabel` 表示）として機能し、`ok` のときだけカードを重ねる。`pending` / `failed` / 行なしは同じ見え方 — **waitUntil が途中で死んでも表示は壊れない**。Amazon 等の bot ブロックで失敗は常態とみなす。再取得の導線は持たない（投稿の編集 API が無い — ADR-003 §5。要るとなってから考える）。

### 6. 取得は HTMLRewriter + ガード

`meta[property="og:*"]`（title / image / description / site_name）+ `<title>` fallback を streaming で拾い、応答は上限（512 KB / 5 秒目安）で打ち切る。UA は正直に名乗る: `MatatabetaiBot/1.0 (+https://matatabetai.shiraoka.workers.dev)`。ガード: http(s) のみ（既存 `RecipeUrl` 検証）・redirect 上限・`text/html` 以外は即打ち切り。任意 URL fetch の悪用対策（レート制限）は Phase 4 の bot-scan-defense に接続する。HTMLRewriter は workerd の API で vitest（Node）には無い — **抽出候補 → プレビュー行の変換だけを純粋関数**に切ってユニットで固定し、取得は境界に置く（テスト方針の棲み分けどおり）。

### 7. 開発・検証はサンドボックス firewall 前提で組む

コンテナの egress 制限により、ローカル dev / e2e から外部レシピサイトへは**出られない**。e2e は外部サイトに依存させず「wrangler dev 自身が配る固定 HTML の URL でカードが出る」「失敗 URL で fallback のまま」の 2 点だけ（型で検知できない配線に限る、e2e 方針どおり）。実サイトでの確認は本番 deploy 後の実投稿で行う。

## 影響

- requirements: 機能要件 3〜5・8 改訂 + 10（URL プレビュー）追加、ドメインモデル・設計メモ・backlog 更新（このコミット）
- CLAUDE.md: 実装パターン例を `RecipeSource` → `LinkPreview` に差し替え（このコミット）
- 実装は 2 PR に分割: **① migration（列追加 + backfill）+ 3 項目化**（ドメイン・フォーム・引き継ぎ・一覧・ユニットテスト）、**② migration（meal_link_previews）+ 取得・カード表示・e2e**。どちらも `drizzle/` を含むので人間 merge、PR 本文にバックアップ手順（skill `cloudflare-d1-drizzle-migration`）
- サジェスト API の応答形が変わる（`recipeSource` → 3 項目）。SPA と同時デプロイなので互換層は持たない

## 却下した選択肢

- **表示時取得 + キャッシュ（KV / Cache API）** — リンク切れで思い出が壊れる。毎表示の外部依存とレイテンシも不要
- **rebuild で CHECK を外す「綺麗な」migration** — バックアップ整備前に CASCADE 事故リスクを取る理由がない。凍結列の掃除は Phase 4 へ
- **入力時プレビュー（貼った瞬間にカード）** — 第一弾に含めない。別表 + status の設計はプレビュー用 endpoint を後から足しても壊れない
- **URL の kind 配列（複数 URL の汎用化）** — 現要件に無い（YAGNI）。列 2 本で足りる
- **Readability（jsdom / linkedom）での本文抽出・ドメイン別抽出サーバー** — html2md は Node + jsdom 前提で Worker に載らず、全文複製は権利・規約リスクが高い。主要サイトが埋め込む JSON-LD（schema.org/Recipe）の調査を先行し ADR-008 候補へ

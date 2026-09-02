# 要件（正典）

2026-08-22 時点の要件（3〜5・8 の改訂と 10 の追加は 2026-09-03 — [ADR-007](adr/007-recipe-links-ogp.md)）。2026-05 の製品意図（CLAUDE.md「このアプリは何のためにあるか」）を前提に、機能要件を列挙する。変更はこのファイルを更新してから実装する。

## 一言で

家族が、その日食べたものを写真・URL・タグ付きで記録し、振り返って楽しみ、「またたべたい」ものを次の献立につなげるアプリ。

## 機能要件

1. **スペースと招待** — スペースにアカウントを招待できる。家族で同じスペースに食べたものを記録する（各ユーザーはスペースを 1 つ作成でき、招待リンクで他のスペースにも参加できる）
2. **画像アップロード** — 投稿に写真を付けられる（複数可）。写真は家族以外に見えない
3. **レシピ URL** — 投稿にレシピの URL を載せられる
4. **作り方メモ** — 自分のレシピやアレンジを本文で書ける（旧「自作レシピ」。3〜5 は排他ではなく独立の任意 3 項目で、併用できる）
5. **お店・商品 URL** — 外食した店や買ったものの URL を、レシピ URL とは別枠で載せられる
6. **食材タグとタグ検索** — 使った食材をタグとして登録し、タグで検索できる（複数タグは AND）
7. **集計** — 食べたものを集計できる。当面は**料理名**で集計する（同じ料理でも冷蔵庫の中身で食材が変わるため、食材は集計単位にしない）
8. **サジェスト** — 投稿時に最近食べたものがサジェストされ、タグで絞り込める。選ぶと前回の内容（リンク 2 種・作り方メモ / タグ）を引き継いで編集できる
9. **またたべたい** — 投稿に「またたべたい」をトグルできる（2026-05 の設計より）。一覧・集計で前に出し、次の献立の起点にする
10. **URL プレビュー** — レシピ／お店・商品の URL は、投稿時に取得して保存したタイトル・画像のカードで表示される（スナップショット: リンク切れでもカードは残る）

## 非機能・前提

- 利用者は家族数人、スマホ中心。認証は passkey（招待制・パスワードなし）
- 写真は private（URL を知っていても cookie なしでは見えない）。アップロード前にクライアントで縮小し EXIF/GPS を落とす
- Cloudflare の無料枠に収まる規模（R2 10 GB-month / Workers Free）
- 将来の一般公開に備え、bot scan 対策・レート制限・認可境界はインフラ側で最初から持つ
- 家族規模の運用で十分な範囲に留める: リアルタイム同期・通知・栄養計算は要件外

## ドメインモデル（草案 — 実装時に ADR で確定する。認証・スペースの 6 表は [ADR-002](adr/002-auth-spaces-invites.md)、meals / tags / meal_tags は [ADR-003](adr/003-meals-tags.md)、meal_photos は [ADR-004](adr/004-meal-photos-r2.md) で確定済み。サジェストは表を増やさず読みだけで組む — [ADR-005](adr/005-meal-suggestions.md)。リンク 3 項目化と meal_link_previews は [ADR-007](adr/007-recipe-links-ogp.md)）

```
spaces / space_members / invites          ← skill cloudflare-workers-space-membership-invite
users / credentials / sessions            ← skill cloudflare-workers-passkey-auth

meals        (id, space_id, name, name_normalized, eaten_on, meal_type?,
              recipe_url, shop_url, recipe_text (作り方メモ), note,
              mata_tabetai (bool), created_by, created_at, updated_at)
              ※ 旧 recipe_source_type / url は凍結列（ADR-007 §2。Phase 4 の rebuild で掃除）
meal_photos  (id, meal_id, r2_key, thumb_key, content_type, size_bytes, width, height,
              created_by, created_at)                                   ← skill cloudflare-r2-private-image-upload
meal_link_previews (meal_id, kind ('recipe'|'shop'), url, status ('pending'|'ok'|'failed'),
              title, description, site_name, image_r2_key, fetched_at, created_at)
              PK(meal_id, kind)                                        ← ADR-007
tags         (id, space_id, name, name_normalized)   UNIQUE(space_id, name_normalized)
meal_tags    (meal_id, tag_id)                       PK(meal_id, tag_id)
```

- `name_normalized` = NFKC 正規化 + trim + 小文字化。集計・サジェスト・タグ一意性はこちらを使う。表示は入力そのまま
- `recipe_url` / `shop_url` / `recipe_text`（作り方メモ）は独立の任意 3 項目（併用可）。旧 `RecipeSource` DU（排他）は [ADR-007](adr/007-recipe-links-ogp.md) で廃止し、`recipe_source_type` と `url` は CHECK を満たすためだけの凍結列
- `meal_type`（朝/昼/夜/間食）は任意。集計要件には不要なので nullable
- `eaten_on` は日付（JST の日付文字列）。時刻は持たない

## 主要クエリ

- 集計: `SELECT name, COUNT(*) FROM meals WHERE space_id = ? AND eaten_on BETWEEN ? AND ? GROUP BY name_normalized ORDER BY COUNT(*) DESC`
- タグ検索（AND）: `meal_tags` を tag ごとに JOIN、または `GROUP BY meal_id HAVING COUNT(DISTINCT tag_id) = N`
- サジェスト: 料理名ごとの直近 1 件（`row_number() over (partition by name_normalized order by eaten_on desc, created_at desc)` = 1）を `eaten_on DESC` で 20 件。`GROUP BY` + `MAX` の bare column は同着で行が定まらない — [ADR-005](adr/005-meal-suggestions.md) §2
- またたべたい: `WHERE mata_tabetai = 1 ORDER BY eaten_on DESC`
- 部分一致: `name_normalized LIKE '%' || ? || '%'`（FTS5 は要件が出てから）

## 決めていないこと（backlog）

- レシピ本文の取り込み — JSON-LD（`schema.org/Recipe`）の材料・手順を「作り方メモ」の下書きに整形する案が本命（Readability 全文抽出は権利・規約リスクで採らない）。規約調査（人間がホストで cookpad 等の原文を確認）→ ADR-008 で決める
- 期間集計の UI（週 / 月）、タグクラウド
- スペース切替 UI（内部モデルは複数スペース対応、UI は当面 1 スペース）

## 実装への設計メモ（CLAUDE.md から移設、2026-08-23）

- **集計は料理名**（`meals.name`）で `GROUP BY`。同じ料理でも冷蔵庫の中身で食材が変わるため、食材ではなく名前が集計単位。保存時に NFKC 正規化 + trim した `name_normalized` を持ち、表記ゆれを減らす
- **食材はタグ**（`tags` / `meal_tags` の多対多、スペース単位で一意）。タグ検索は `?tags=a&tags=b` の AND
- **サジェスト**: 投稿画面に料理名ごとの直近 1 件を出し、タグ（AND）で絞り込める。選ぶと前回のリンク 2 種・作り方メモ / タグを複製して編集できる（メモ・日付・タイミングは引き継がない — [ADR-005](adr/005-meal-suggestions.md) §5）
- **リンクとメモ**はレシピ URL / お店・商品 URL / 作り方メモの独立 3 項目（併用可、排他をやめた）。URL プレビューは投稿時スナップショット + `meal_link_previews` + R2 — [ADR-007](adr/007-recipe-links-ogp.md)
- **またたべたい** は投稿に対するトグル（favorite）。UI 上の主役なので一覧・集計で前に出す
- **日本語の部分一致検索**は当面 `LIKE '%…%'`（家族規模）。D1 の FTS5 は使えるが日本語には trigram tokenizer が要り、D1 での可否は要確認

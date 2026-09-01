# 要件（正典）

2026-08-22 時点の要件。2026-05 の製品意図（CLAUDE.md「このアプリは何のためにあるか」）を前提に、機能要件を列挙する。変更はこのファイルを更新してから実装する。

## 一言で

家族が、その日食べたものを写真・URL・タグ付きで記録し、振り返って楽しみ、「またたべたい」ものを次の献立につなげるアプリ。

## 機能要件

1. **スペースと招待** — スペースにアカウントを招待できる。家族で同じスペースに食べたものを記録する（各ユーザーはスペースを 1 つ作成でき、招待リンクで他のスペースにも参加できる）
2. **画像アップロード** — 投稿に写真を付けられる（複数可）。写真は家族以外に見えない
3. **レシピ URL** — 投稿にレシピの URL を載せられる
4. **自作レシピ** — URL ではなく自分でレシピ（本文）を書ける
5. **外食・購入品の URL** — 外食した店や買ったものの URL を載せられる（3 と同じ「URL 1 本」で扱う）
6. **食材タグとタグ検索** — 使った食材をタグとして登録し、タグで検索できる（複数タグは AND）
7. **集計** — 食べたものを集計できる。当面は**料理名**で集計する（同じ料理でも冷蔵庫の中身で食材が変わるため、食材は集計単位にしない）
8. **サジェスト** — 投稿時に最近食べたものがサジェストされ、タグで絞り込める。選ぶと前回の内容（URL / レシピ / タグ）を引き継いで編集できる
9. **またたべたい** — 投稿に「またたべたい」をトグルできる（2026-05 の設計より）。一覧・集計で前に出し、次の献立の起点にする

## 非機能・前提

- 利用者は家族数人、スマホ中心。認証は passkey（招待制・パスワードなし）
- 写真は private（URL を知っていても cookie なしでは見えない）。アップロード前にクライアントで縮小し EXIF/GPS を落とす
- Cloudflare の無料枠に収まる規模（R2 10 GB-month / Workers Free）
- 将来の一般公開に備え、bot scan 対策・レート制限・認可境界はインフラ側で最初から持つ
- 家族規模の運用で十分な範囲に留める: リアルタイム同期・通知・栄養計算は要件外

## ドメインモデル（草案 — 実装時に ADR で確定する。認証・スペースの 6 表は [ADR-002](adr/002-auth-spaces-invites.md)、meals / tags / meal_tags は [ADR-003](adr/003-meals-tags.md) で確定済み。meal_photos は写真実装時）

```
spaces / space_members / invites          ← skill cloudflare-workers-space-membership-invite
users / credentials / sessions            ← skill cloudflare-workers-passkey-auth

meals        (id, space_id, name, name_normalized, eaten_on, meal_type?,
              recipe_source_type ('url'|'text'|'none'), url, recipe_text, note,
              mata_tabetai (bool), created_by, created_at, updated_at)
meal_photos  (id, meal_id, r2_key, thumb_key, content_type, size_bytes, width, height,
              created_by, created_at)                                   ← skill cloudflare-r2-private-image-upload
tags         (id, space_id, name, name_normalized)   UNIQUE(space_id, name_normalized)
meal_tags    (meal_id, tag_id)                       PK(meal_id, tag_id)
```

- `name_normalized` = NFKC 正規化 + trim + 小文字化。集計・サジェスト・タグ一意性はこちらを使う。表示は入力そのまま
- `recipe_source_type` + `url` / `recipe_text` は CLAUDE.md の `RecipeSource` Discriminated Union を平坦化したもの。`url` は「レシピ」「店」「商品」を区別しない 1 本
- `meal_type`（朝/昼/夜/間食）は任意。集計要件には不要なので nullable
- `eaten_on` は日付（JST の日付文字列）。時刻は持たない

## 主要クエリ

- 集計: `SELECT name, COUNT(*) FROM meals WHERE space_id = ? AND eaten_on BETWEEN ? AND ? GROUP BY name_normalized ORDER BY COUNT(*) DESC`
- タグ検索（AND）: `meal_tags` を tag ごとに JOIN、または `GROUP BY meal_id HAVING COUNT(DISTINCT tag_id) = N`
- サジェスト: `SELECT name, MAX(eaten_on) FROM meals WHERE space_id = ? [AND meal_id IN (tag filter)] GROUP BY name_normalized ORDER BY 2 DESC LIMIT 20`
- またたべたい: `WHERE mata_tabetai = 1 ORDER BY eaten_on DESC`
- 部分一致: `name_normalized LIKE '%' || ? || '%'`（FTS5 は要件が出てから）

## 決めていないこと（backlog）

- レシピ URL の OGP（タイトル・画像）表示 — `HTMLRewriter` で取得する案。hotlink はしない
- 期間集計の UI（週 / 月）、タグクラウド
- スペース切替 UI（内部モデルは複数スペース対応、UI は当面 1 スペース）

## 実装への設計メモ（CLAUDE.md から移設、2026-08-23）

- **集計は料理名**（`meals.name`）で `GROUP BY`。同じ料理でも冷蔵庫の中身で食材が変わるため、食材ではなく名前が集計単位。保存時に NFKC 正規化 + trim した `name_normalized` を持ち、表記ゆれを減らす
- **食材はタグ**（`tags` / `meal_tags` の多対多、スペース単位で一意）。タグ検索は `?tags=a&tags=b` の AND
- **サジェスト**: 投稿画面で直近の料理名を `DISTINCT` で出し、タグで絞り込める。選ぶと前回の URL / レシピ / タグを複製して編集できる
- **URL** は 1 本（レシピ／外食の店／購入した商品）、**自作レシピ**は本文 — `RecipeSource` の Discriminated Union
- **またたべたい** は投稿に対するトグル（favorite）。UI 上の主役なので一覧・集計で前に出す
- **日本語の部分一致検索**は当面 `LIKE '%…%'`（家族規模）。D1 の FTS5 は使えるが日本語には trigram tokenizer が要り、D1 での可否は要確認

# ADR-003: 記録（meals / tags / meal_tags / またたべたい）の実装で確定した決定

- ステータス: 承認
- 日付: 2026-09-01

## コンテキスト

requirements.md「ドメインモデル（草案）」のうち記録部分を Phase 2 で実装した（migration 0002）。0002 自体は新テーブルのみの純増で rebuild は無いが、meals は meal_tags（CASCADE 子）の親になるため、**将来 meals を作り直す migration は D1 の CASCADE 事故**（skill `cloudflare-d1-drizzle-migration`、PRAGMA foreign_keys=OFF を D1 が無視する問題）に直結する。列と制約は最初に決め切る方針で確定した。meal_photos は写真実装時（skill `cloudflare-r2-private-image-upload`）に確定する。

## 決定

### 1. スキーマ（草案の確定）

草案どおり + `tags.created_at` を追加。「またたべたい」は `meals.mata_tabetai`（bool 列）であって単独の表ではない。`eaten_on` は JST の日付文字列 `YYYY-MM-DD`（時刻なし）。index は meals(space_id, eaten_on)（一覧）、meal_tags(tag_id)（タグ検索）、tags UNIQUE(space_id, name_normalized)。

### 2. CHECK は recipe_source の整合だけ。meal_type には付けない

`meals_recipe_source_check` が url ⇔ `url` 列 / text ⇔ `recipe_text` / none ⇔ 両方 NULL の対応（`RecipeSource` DU の平坦化）を DB でも強制する。この不変は安定と判断した。一方 **meal_type に CHECK を付けないのは意図**: 値の追加（例: 夜食）が table rebuild = meal_tags の CASCADE 事故リスクになるため。enum は zod 境界で守る。

### 3. created_by は cascade しない

表示・監査用で認可軸ではない（境界は space_id）。user 削除で家族の思い出が消えないよう ON DELETE は no action — 参照が残る限り user の削除は FK エラーで音を立てて失敗する側に倒す。

### 4. タグは投稿時に space 単位で upsert、1 つの原子的 batch

`INSERT … ON CONFLICT(space_id, name_normalized) DO NOTHING` × タグ数 → meal INSERT → `meal_tags INSERT … SELECT`（tag id の解決を SQL 内に閉じる）を 1 つの `d1.batch` で書く。同名タグの同時投稿は DO NOTHING が吸収する。表示名は最初に登録した表記が勝ち、`normalizeName` = NFKC + trim + 小文字。meal 削除で meal_tags は CASCADE、tags は残す（サジェスト用）。

### 5. API と一覧の範囲

`/api/spaces/:spaceId/meals`（spaceMiddleware の内側）。**meal を引く文は必ず space_id も比較する** — 他スペースの meal id を自スペースの URL に当てても 404（e2e で固定）。作成時「またたべたい」は常に false、`PATCH { mataTabetai }` でトグル。編集 API は持たない（MVP。修正は削除 → 再投稿）。一覧は eaten_on DESC / created_at DESC の直近 50 件 — D1 の bound parameter 上限にタグの `inArray` が収まる値。期間 UI・ページングは Phase 3。

### 6. UI は 1 スペース固定のフィード

owner のスペース優先で 1 つに決める（スペース切替 UI は backlog どおり持たない）。ホームは投稿フォーム → 日付ごとの一覧 → スペース管理の順。URL は http(s) だけを型（`isHttpUrl`）で通し、`<a href>` への `javascript:` 混入を境界で落とす。

## 影響

- migration 0002 は純増（CREATE TABLE / CREATE INDEX のみ）。既存データに触れない。それでも merge 前 backup は runbook どおり取る
- 将来 meals の列・CHECK を変える migration は rebuild になる — skill の runbook（backup → 生成 SQL 確認 → row count 検査）必須

## 却下した選択肢

- またたべたい を per-user の別テーブルに — 「家族の合意としての 1 フラグ」で 2026-05 設計どおり。per-user 化は要件が出てから
- meal_type の CHECK — §2 のとおり rebuild リスクと引き換えにしない
- FTS5・ページング — 家族規模は LIKE と 50 件で足りる（Phase 3 で再訪）
- 投稿の編集 API — §5。サジェストの「前回内容の引き継ぎ」は複製 + 新規投稿で満たす予定

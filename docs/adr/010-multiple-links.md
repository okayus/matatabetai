# ADR-010: レシピ・お店の URL を複数持てるようにする（meal_links への一本化）で確定した決定

- ステータス: 承認
- 日付: 2026-09-06

## コンテキスト

requirements 機能要件 3「レシピ URL」/ 5「お店・商品 URL」は 1 投稿につき 1 本ずつで、[ADR-007](007-recipe-links-ogp.md) §1 が `meals.recipe_url` / `meals.shop_url` の 2 列として確定した。同 ADR の「却下した選択肢」は **「URL の kind 配列（複数 URL の汎用化）— 現要件に無い（YAGNI）。列 2 本で足りる」** と書いている。

その要件が出た（ユーザ指示 2026-09-06）。同じ料理でも参考にしたレシピは 1 本とは限らない（「この分量はこっち、焼き方はこっち」）し、外食・買い物も店の公式ページと通販ページのように複数ある。1 本しか置けないと、2 本目は作り方メモに URL 文字列として書くしかなく、リンクにもカードにもならない。

決めるのは 3 つ — ①複数化の置き場（列 → 表）、②上限、③既存の 2 列と `meal_link_previews` の始末。

## 決定

### 1. ADR-007 §4「kind 配列は YAGNI」を撤回し、`meal_links` 表に一本化する

URL とそのプレビューを 1 行に持つ子表を新設する:

```
meal_links (id PK, meal_id FK CASCADE, kind ('recipe'|'shop'), position, url,
            status ('pending'|'ok'|'failed'), title, description, site_name,
            image_r2_key, fetched_at, created_at)
```

**表を 2 つに割らない** — URL 1 本に対してスナップショットはちょうど 1 つで、1:1 の関係を 2 表に分けても join が増えるだけ。ADR-007 §4 の `meal_link_previews` は「列 2 本に対する子」だったが、URL 自体が子になった以上、プレビューはその行の属性でよい。

`position` は kind の中での並び（フォームに入力した順）。`created_at` 順に頼らないのは、編集で URL を足し引きしても利用者が並べたとおりに出したいから。

**`id` を持つのは配信 URL のため** — og:image の配信は `/meals/:mealId/links/:linkId/image` になる（従来は kind が URL の一部だった）。R2 キーも `ogp/<spaceId>/<mealId>/<linkId>`。ADR-008 §6 が付けていた末尾のランダム `imageId` は落とす: あれは「同じ (meal, kind) の取得が 2 本走ると、負けたジョブの補償削除が勝ったジョブの画像を消す」ための識別子だったが、行の id は不変（URL が変われば別の行）で 1 行につき取得は 1 回しか走らないので、衝突しようがない。

### 2. 上限は 1 投稿あたり合計 6 本（kind をまたいだ合計）

Workers Free の**外部 subrequest は 50 / invocation**（Cloudflare docs、2026-09-06 確認。D1 / R2 などバインディングへの呼び出しは別枠の 1,000）。1 URL の取得は最悪 8 subrequest（ページ本体 + リダイレクト 3 hop + og:image で同じだけ）なので、6 本で 48 と収まる。

上限は**レシピ・お店の合計**で数える（kind ごとに 5 本ずつのような形にすると、両方埋めたときに予算を超える）。フォームは 6 行に達したら「追加」を無効にし、サーバーも `MealContentInput` で弾く。任意 URL の fetch を 1 投稿で増やすことになるので、ADR-007 §6 が Phase 4 の bot-scan-defense に送ったレート制限が入るまで、この上限が濫用の歯止めを兼ねる。

### 3. migration は完全 additive — 既存行を書き換えない

D1 のバックアップはまだ整備されていない（Phase 4 の 1 手目）。したがって:

- `CREATE TABLE meal_links` + `INSERT … SELECT` の backfill だけを行う（既存表への `UPDATE` / `DROP` / rebuild はしない）
- backfill は `meals.recipe_url` / `shop_url` を URL の出所に、`meal_link_previews` を LEFT JOIN してカードを引き継ぐ。プレビュー表ができる前（migration 0005 以前）の投稿には行が無いので `status` は `failed` に倒す — ADR-007 §5 のとおり `failed` と行なしは同じ見え方（プレーンリンク）なので、表示は変わらない
- `meals.recipe_url` / `shop_url` と `meal_link_previews` 表は**凍結**する（読まない・書かない）。掃除は Phase 4 のバックアップ整備後、`recipe_source_type` / `url` の rebuild（ADR-007 §2）と同じ migration でまとめる

新しい投稿の `meals.recipe_url` は NULL のままになる。**真実は `meal_links` 一箇所**で、2 箇所に同じ URL を書く（1 本目だけ列にも残す等）ことはしない。

### 4. 編集は「同じ URL の行は据え置き、URL 単位で足し引き」

ADR-008 §5 は kind 単位で「URL が変わっていなければスナップショットを保つ」と決めた。これを URL 単位に読み替える:

- 保存済みの行と入力の `(kind, url)` が一致 → **行はそのまま**（カードは投稿時点の姿を保つ）。並びだけ変わったなら `position` を更新する
- 入力から消えた行 → 削除（持っていた og:image は R2 から先に消す — ADR-004 §6）
- 入力にしか無い `(kind, url)` → `pending` 行を立てて取りに行く

差分は純粋関数 `planLinks(saved, links)` に閉じ、行 id は境界（コマンド）で採る。

### 5. 同じ URL は 1 本に畳む。空欄は「無い」

同じ kind の中で同じ URL を 2 度入れても 1 行にする（同じページを 2 回取りに行き、同じカードが 2 枚並ぶ意味がない）。空文字・空白だけの欄は落とす — フォームは常に空の 1 行を残すので、「何も入れなかった」は空欄のまま送られてくる。kind をまたぐ重複は畳まない（レシピとしても店としても貼りたいことはあり、バッジが違えば別の意味になる）。

### 6. フォームは kind ごとに行を増やす。並べ替えは持たない

「＋ レシピ URL を追加」で欄が 1 行増え、2 行以上あるときだけ各行に「外す」が出る。行が 0 になったら空の 1 行を置く（追加を押さないと 1 本目が入れられない、を避ける）。上下の並べ替え UI は作らない（外して入れ直せば済む。要件に無い）。

読み上げ名は 1 行のときだけ「レシピ URL」、2 行以上のときは「レシピ URL 1」「レシピ URL 2」…（同じ名前の入力が並ぶと、どれを指しているか読み上げから分からない）。

## 影響

- migration 1 本（`drizzle/0006_meal_links.sql`）。**人間 merge**（PR 本文に skill `cloudflare-d1-drizzle-migration` のバックアップ手順）
- requirements: 機能要件 3 / 5 / 8 / 10 の改訂、ドメインモデルと設計メモの更新
- API の形が変わる（`recipeUrl` / `shopUrl` / `previews` → `links: {id, kind, url, preview}[]`、サジェストは `recipeUrls` / `shopUrls`）。SPA と同時デプロイなので互換層は持たない（ADR-007 の前例）
- og:image の配信 route が `/link-previews/:kind/image` → `/links/:linkId/image` に変わる。link id は不変で、その中身も一度書かれたら変わらないので `Cache-Control` を `no-cache` から `immutable` にできる（ADR-008 §5 が毎回 ETag を確かめていた理由 — 「URL を貼り替えると同じ URL の中身が変わる」— が無くなる）
- unit: URL リストの検証（空欄・重複・http(s)・合計 6 本）、`planLinks`、フォームの行操作と読み上げ名
- e2e: `link-preview` を「レシピ 2 本（片方は取れる / 片方は取れない）+ お店 1 本」に広げる（複数行が独立にカードになるのは配線の事実で、型では保証できない）

## 却下した選択肢

- **`meals.recipe_url` を JSON 配列にする** — プレビューは URL ごとの行なので、結局 URL を 2 箇所（列の JSON と行）に持つことになる。SQL から 1 本ずつ引けず、型も `string` のまま
- **`meal_link_previews` の PK を (meal_id, kind, url) に変える** — 表の rebuild になる（PK 変更）。子を持たない葉なので CASCADE 事故にはならないが、バックアップ未整備で既存表を作り直す理由がない。新表 + backfill なら失敗しても既存行が残る
- **レシピだけ複数、お店は 1 本のまま** — モデルは `kind` + `position` で同じものになるのに、フォームとバリデーションだけ非対称になる。「なぜレシピだけ増やせるのか」を利用者にも実装にも説明できない
- **`meal_link_previews` をこの migration で DROP する** — backfill が間違っていたときに戻す先が消える。バックアップが整うまで残す（凍結表）
- **kind ごとに 5 本（合計 10）** — 両方埋めると最悪ケースで subrequest 予算（50）を超え、超えた分のプレビューだけが黙って failed になる。壊れはしないが「取れないことがある」を上限の設計で作る理由がない

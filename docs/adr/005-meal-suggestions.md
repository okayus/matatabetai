# ADR-005: 投稿時サジェスト（直近の料理名・タグ絞り込み・前回内容の引き継ぎ）の実装で確定した決定

- ステータス: 承認
- 日付: 2026-09-02

## コンテキスト

requirements.md 機能要件 8「投稿時に最近食べたものがサジェストされ、タグで絞り込める。選ぶと前回の内容（URL / レシピ / タグ）を引き継いで編集できる」を Phase 2 の最後として実装した。ADR-003 §5 が「投稿の編集 API は持たない。サジェストの引き継ぎは複製 + 新規投稿で満たす」と決めていたので、これはその実装でもある。

この機能は製品意図の 2 つ目「次に食べるもののアイディアにつなげる」に直接効く一方、**集計（要件 7、Phase 3）と地続き**で、放っておくと料理名の回数・期間集計まで書きたくなる。境界を決めるのがこの ADR の主目的。

## 決定

### 1. 新しいテーブルを作らない（migration なし）

サジェストは `meals` / `meal_tags` / `tags` の読みだけで組む。「直近の料理名」を別テーブルに持つと二重更新になり、meals は meal_tags の親なので後からの列追加が D1 の CASCADE 事故（skill `cloudflare-d1-drizzle-migration`）に直結する。ADR-003 §1 の「列と制約は最初に決め切る」を維持する。

### 2. 料理名ごとの直近 1 件は `row_number()` で名指しする

`GROUP BY name_normalized` + `MAX(eaten_on)` の bare column は、同じ日に同じ料理が 2 度あると**どの行の URL / レシピが返るか決まらない**（集約が 2 つ以上あるときの SQLite の bare column は未定義）。`row_number() over (partition by name_normalized order by eaten_on desc, created_at desc)` で 1 行を決め、`created_at` を tie-breaker にする。requirements「主要クエリ」のサジェスト行はこの形に読み替える。「またたべたい」は `max(mata_tabetai) over (partition by name_normalized)` — **同じ料理名のどれか 1 つでも付いていれば札に ♥**（次の献立の起点になるのは投稿ではなく料理なので）。

スペース全体を走査してから 20 件に切るが、家族規模の行数では index(space_id, eaten_on) だけで足りる。ページングも FTS5 も持たない（ADR-003 §5 と同じ線）。

### 3. タグ絞り込みは AND、`?tags=` は**表示名**で送る

`meal_tags` を `GROUP BY meal_id HAVING count(distinct tag_id) = N` で畳んだ id 集合を `meals.id IN (…)` に噛ませる（requirements のタグ検索と同じ形）。パラメータは tag id ではなく名前で、サーバーが `normalizeName`（NFKC + trim + 小文字）してから比べる — 投稿 API がタグ名を受けるのと揃い、将来の自由入力フィルタもそのまま乗る。上限 10 個、正規形で重複を畳む（`SuggestionTagsQuery`）。

絞り込み中は **lastEatenOn も ♥ も「絞った集合の中での」値**になる。フィルタが候補集合を定義する、という一貫した読み方を採り、絞り込みの外まで見に行く二重クエリは持たない。

### 4. 絞り込みの語彙は `GET /api/spaces/:spaceId/tags`（別ルート）

サジェスト応答に混ぜず独立させる。よく使う順（同数なら name_normalized 昇順）に最大 50 件、`meal_tags` と inner join して**実際に使われているタグだけ**返す（meal を消しても tags 行は残る — ADR-003 §4）。Phase 3 のタグ検索 UI もこの語彙を使う。

### 5. 引き継ぐのは 料理名 / URL・レシピ / タグ だけ

`meal_type`（朝昼夜）と `note` と `eaten_on` は引き継がない。**メモはその回のエピソード**（「子どもがおかわりした」）であって料理の属性ではなく、日付とタイミングは今回の食事のものだから。この判断は `applySuggestion` という純粋関数に置き、ユニットテストで固定した（型では表せない意味なので）。写真も引き継がない（前回の写真が今回の記録に付くのは事実として誤り）。

### 6. フォームは制御コンポーネントにする

サジェストが料理名・タグ・レシピ欄を**外から書き換える**ので、非制御 + `FormData` のままでは引き継ぎができない。`MealFormState`（全部 string の 1 オブジェクト）を唯一の出所にし、`emptyMealForm` / `applySuggestion` / `toCreateMealBody` / `toSourceKind` / `toMealType` を `src/lib/meal-form.ts` の純粋関数として切り出した。DOM を読む変換（`as MealType` の素の cast）も消えた。選択中の写真は同じ state に触らないので、札を選んでも消えない。

### 7. UI は 1 行の横スクロール、タグ絞り込みは `<details>` の中

札 20 枚を縦に積むと投稿フォームが押し下がるので、`overflow-x: auto` + `scroll-snap-type: x proximity` の 1 行に寝かせる（札は写真 or 🍚 + 料理名 + ♥ + 前回日付）。タグの札は押下状態のボタン（`aria-pressed`）で、checkbox にはしない — 押した瞬間に一覧が変わる操作であり、`visually-hidden` な checkbox は実際にクリックできない（Playwright の hit test も通らない）ため。読み上げ用に各札は「前回 2026年8月28日(金)。前回の内容を引き継ぐ」を持ち、引き継ぎ後は `role="status"` が知らせる。

## 影響

- migration なし。本番 D1 への適用も backup も要らない（この PR は auto-merge の例外に当たらない）
- 一覧セクションが `<section aria-labelledby>` になった（サジェストの札と一覧に同じ料理名が並ぶので、e2e も人も名前で region を区別する）
- e2e は golden path に「2 品目 → 札が 2 枚 → タグ AND で絞る → 選んで引き継ぐ」を、boundary に「他スペースの suggestions は 404 / 自分の suggestions・tags に他家族は混ざらない」を追加。集約クエリは `space_id` を落としても 500 にならず**静かに漏れる**ので、境界側に置いた

## 却下した選択肢

- **回数（何回食べたか）を札に出す** — 集計は要件 7 = Phase 3。window 関数 1 つで足りるが、ここで出すと期間集計 UI を先取りしてしまう
- **「またたべたい」を先頭に並べる** — 一覧・集計で前に出すのは要件 9 のとおりだが、サジェストの並びは requirements「主要クエリ」の直近順のままにし、♥ は印だけ。またたべたい一覧は Phase 3 に持つ
- **datalist / combobox で料理名を補完** — 入力の省力化にはなるが、「前回の内容を引き継ぐ」には結局札が要る。2 つの補完 UI を並べない
- **サジェスト応答にタグ語彙を同梱** — 絞り込みのたびに同じ語彙を運ぶ。§4 の別ルートにした
- **写真も引き継ぐ** — §5

# ADR-013: kokemusu への日次投稿（自分が作った料理を 1 日 1 苔片で送る）で確定した決定

- ステータス: 承認
- 日付: 2026-09-11

## コンテキスト

持ち主の日記 [kokemusu](https://github.com/okayus/kokemusu)（自己ホスト・完全プライベートの別 Worker）に、またたべたいの記録から「**自分が作った料理**」を積みたい（持ち主の要望 2026-09-09。requirements 機能要件 18）。作った人は [ADR-012](012-meal-cooks.md) の `meal_cooks` で記録できるようになった。

受け側の契約は kokemusu の [`docs/senders.md`](https://raw.githubusercontent.com/okayus/kokemusu/main/docs/senders.md) と、そこから生成される [`docs/senders/posts.schema.json`](https://raw.githubusercontent.com/okayus/kokemusu/main/docs/senders/posts.schema.json) が正で、**この ADR には上限・キーの一覧を転記しない**（転記した契約は 3 日で古くなった — mazuoboeru [ADR-0017 補記](https://raw.githubusercontent.com/okayus/mazuoboeru/main/docs/adr/0017-daily-digest-push-to-kokemusu.md)）。本 ADR が前提にするのは次の性質だけ: 送り側を知らない汎用の投稿口が 1 つ、PAT（Bearer）で届く、苔片を「送った日」ではなく「在った日」に積むキーがある、**冪等キーは無い**（リトライは二重投稿になり得る）。

前例は mazuoboeru の日次ダイジェスト（ADR-0017）: 00:15 JST の Cron、純粋な builder + throw しない境界、受け側の URL は `vars`・PAT は secret、未設定なら黙ってスキップ。

制約: CLAUDE.md は「Cron Triggers は当面持たない」と決めている。Workers Free の Cron は **アカウントあたり 5 本・CPU 10 ms / 発火**（I/O 待ちは数えない）。サンドボックスからは kokemusu のホストに出られないので、送信そのものは e2e で通せない。

決めるのは 8 つ — ①きっかけ、②誰の料理か、③どのスペースから、④粒度、⑤本文とタグ、⑥送った記録の持ち方、⑦失敗時、⑧過去分と UI。

## 決定

### 1. 日次 Cron（00:15 JST）で「閉じた日」の分を送る。CLAUDE.md の Cron 禁止は「この 1 本だけ」に改める

`triggers.crons` に `15 15 * * *`（UTC = 00:15 JST）を 1 本。対象は **`eaten_on` が前日以前**（JST）の記録で、その日はもう閉じている。今日の分は翌晩まで待ち、未来の日付で記録したものはその日が閉じるまで待つ。遅れて記録した分（食べた日の数日後に入力）も `eaten_on` の日に積まれる（在った日を指すキーに `eaten_on` を入れる）。

記録時のイベント駆動にしないのは、(a) 1 日 1 苔片（§3）にまとめられない、(b) 送った後に受け側で直す口が無いので、削除・訂正の猶予（その日のうち）が欲しい、(c) 記録は日中に何度も起き、そのたびに外へ fetch が走る、から。手動ボタンは「定期投稿」という要望に合わない。

Cron の禁止を全面解除はしない — 定期実行を要する機能はこれが最初で、ほかの用途（orphan 掃除など）は引き続き持たない。Free の CPU 10 ms は、D1 数クエリ + fetch 数本の I/O 待ちが数えられないので収まる。本文の組み立ては純粋関数で軽く保つ。

### 2. 誰の料理か = `vars.KOKEMUSU_COOK_USER_ID`。全スペースから、複数人で作った回も含める

`users` に持ち主の印は無く `spaces` にも owner 列は無い（`space_members.role` だけ）。誰を「自分」とするかは **`wrangler.jsonc` の `vars` にコミットする user id** で指す。mazuoboeru が `KOKEMUSU_URL` を `vars` に置いたのと同じ理由 — 秘密ではなく、dashboard で足した平文 var と違い次の deploy で消えない。user id は UUID で、それだけでは何もできない（全 route が session と所属を要求する）ので public リポに載ってよい。

スペースで絞らない。軸は「誰が作ったか」であって「どこに記録したか」ではなく、参加先のスペース（実家など）で作った回も日記に載る。クエリは `meal_cooks.user_id = ?` だけで、`meal_cooks` に `user_id` からの索引を足す（ADR-012 §影響が「作った人で絞るとき」に予約していたもの。`CREATE INDEX` は additive）。

作った人が複数（自分 + 家族）の記録も含める。二人で作った回も「作った」に変わりはない。本文に名前は出さない（§4）ので、一人で作った回と同じ見え方になる。

### 3. 粒度は 1 日 1 苔片。古い日から、1 回の発火で 20 日まで

同じ日に作った料理は 1 本の苔片に箇条書きでまとめる（日記として読みやすく、苔片が増えすぎない）。1 回の発火で送るのは古い日から最大 20 日ぶん — Workers Free の外部 subrequest 50 / invocation（[ADR-010](010-multiple-links.md) §2）と受け側のレート制限に対して十分な余裕を残し、残りは翌晩に回る。fetch は並べて撃たず 1 本ずつ待つ。

ある日を送った後にその日の記録が増えた（遅れて記録した）ら、同じ日に **2 本目の苔片**が立つ。受け側に苔片を更新する口が無いので、これは仕様。台帳（§5）は記録単位なので、送ったものを二度含めない。

### 4. 本文は料理名とレシピのリンクだけ。タグは `料理`、`kind` は `output`

Markdown の箇条書き 1 行 = 記録 1 件（同じ日の中は記録した順）:

```
- 肉じゃが [白ごはん.com](https://…) [レシピ](https://…)
- 味噌汁
```

- リンクはその記録の**レシピ URL**（`meal_links` の `kind = 'recipe'`、`position` 順）。リンク文字はプレビューのタイトル（`status = 'ok'` で `title` があるとき）、無ければ「レシピ」。お店・商品 URL は「作った料理」に無縁なので送らない
- 料理名・タイトルは UGC なので空白を畳み、Markdown のリンク文字を壊す `[` `]` をエスケープする（mazuoboeru の `linkText` と同じ）
- 入れないもの: ♥ またたべたい、食材タグ、一緒に作った人の名前、作り方メモ、ひとことメモ、写真（受け側に写真の口が無い）。持ち主の選択（2026-09-11）— 日記には「何を作ったか」だけあればよく、細部はまたたべたい側で見る
- タグは **`料理` だけ**。senders.md の作法「出所を tags で名乗る」は取らない（要望は「当面 料理 だけ」。手で書いた料理の苔片と同じ石に落ちるのが狙い）
- `kind` は **`output`**（作るのは「出す」側）。`lastDay` / `thickness` は送らない（単日）
- 本文の上限は vendoring した schema（§7）から読み、builder は念のため末尾を切り詰める

### 5. 送った記録は新表 `kokemusu_posts` に持つ

```
kokemusu_posts (meal_id PK FK meals CASCADE,
                status ('ok'|'retry'|'failed'), http_status, attempted_at, posted_at)
```

`meals` の CASCADE 子で、記録 1 件につき 1 行（同じ苔片に入った記録は同じ結果の行を持つ）。Cron が選ぶのは「行が無い、または `status = 'retry'`」の記録。連携の状態を `meals` の列に混ぜないのは、失敗も行として見えるようにするためと、連携の都合で `meals` を触らない（rebuild を避ける）ため。行は送信の結果が出てから書く — 事前に claim する行を立てると、途中で死んだときにその記録が永遠に送られない。

`http_status` は受け側の応答（ネットワークエラーは null）、`attempted_at` は最後に試した時刻、`posted_at` は `ok` のときだけ。記録を消せば行も消えるが、受け側の苔片は残る（取り消す口が無い）。

### 6. 失敗は翌晩に送り直す。ただし契約・認証の失敗は人手

応答の分類は純粋関数で:

- 2xx → `ok`
- ネットワークエラー / タイムアウト / 5xx / 429 → `retry`（翌晩の発火に含め直す）
- それ以外の 4xx（400 = 契約のずれ、401 = PAT の失効、403 = scope）→ `failed`（送り直さない。ログを見て人が直す）

mazuoboeru（リトライしない・欠けたまま）と違う判断をするのは、台帳が記録単位で「送れなかった」を覚えるので送り直しが安く、欠けた日を手で埋め戻すほうが高くつくから。タイムアウト後に受け側が実は受理していた、という**稀な二重投稿は受容**する（見れば分かり、日記側で消せる）。発火の中でのリトライはしない（1 晩 1 回）。

### 7. 契約は転記せず、schema を vendoring して契約テストで固定する

`pnpm kokemusu:schema` が受け側の `posts.schema.json` を raw GitHub から `worker/kokemusu/posts.schema.json` に落とし（サンドボックスの firewall は GitHub の IP レンジを通す — 2026-09-09 実測）、unit test が builder の出力を `z.fromJSONSchema(schema)` で検証する。受け側が wire を変えれば、schema を更新した時点でこちらの test が落ちる。更新の合図は senders.md の変更履歴、または本番ログの `[kokemusu] POST /api/posts -> 400`。

### 8. 純粋な builder + throw しない境界。env が無ければ黙ってスキップ

- 純粋関数: 対象の記録 → 日ごとの苔片（`buildPosts`）、応答 → `ok | retry | failed`（`classify`）、JST の「今日」と「前日」（`jstDay`）。unit test はここに置く
- 境界: `postToKokemusu(url, pat, post)` は例外を投げず、`[kokemusu] POST /api/posts -> <status>` だけをログする（token・本文・応答は出さない。observability は全部を保存する）。テストの棲み分けどおり境界は unit で mock しない — 本番の初回発火で確かめる
- `KOKEMUSU_URL` / `KOKEMUSU_COOK_USER_ID` は `vars`、`KOKEMUSU_PAT` は Worker Secret。どれか 1 つでも無ければ何もしない（ログ 1 行）。ローカルと e2e には置かない — サンドボックスから出られないし、誤送信の芽を持たない
- `observability`（`enabled: true`、`head_sampling_rate: 1`）をこの PR で ON にする。Cron の結果を見る手段がこれしか無い（bot-scan-defense の 1 手目を前倒し）

### 9. 過去分も送る。UI には出さない

初回の発火は、`meal_cooks` に自分がいる**すべての未送信の記録**（#66 が本番に出た 2026-09-07 以降）を古い日から送る。日記に手で書いた日と並ぶ可能性は受容。

「kokemusu に送った / 失敗」はアプリの画面に出さない。家族には無関係な情報で、台帳は D1 と observability のログで見れば足りる。要るようになってから。

## 影響

- migration `0008_kokemusu_posts.sql` は **`CREATE TABLE` + `CREATE INDEX` だけの完全 additive**（既存表に触らない）。`drizzle/` を含むので人間 merge、PR 本文に runbook のバックアップ手順
- `wrangler.jsonc`: `triggers.crons`、`vars.KOKEMUSU_URL`（`https://kokemusu.shiraoka.workers.dev`）、`vars.KOKEMUSU_COOK_USER_ID`、`observability`。`worker/index.ts` が `scheduled` を export し `event.cron` で分岐（mazuoboeru と同じ形）。`worker/env.ts` の `Secrets` に `KOKEMUSU_PAT?`
- CLAUDE.md「使わない: Cron Triggers」を「Cron Triggers は kokemusu の日次投稿の 1 本だけ」に改訂。requirements に機能要件 18 とドメインモデルの `kokemusu_posts`、roadmap に Phase 5（Phase 4 より先に進める — 持ち主の指示 2026-09-11。D1 バックアップは後回し）
- 人手（ホスト）: kokemusu で PAT を発行（名前 matatabetai、`post:write`）→ 値を表示してから `wrangler secret put KOKEMUSU_PAT` に貼る（pipe で入れると誰も知らない token になる — skill `cloudflare-workers-passkey-auth` の pitfall）→ `GET /api/auth/me` で smoke。自分の user id をコンテナに伝えて `vars` に入れる。アカウント（shiraoka）の Cron 本数が Free の 5 本を超えないか（mazuoboeru が 2 本）。merge 翌朝に kokemusu の石とログを確認。kokemusu の senders.md「公開されている送り側」に matatabetai を足す（kokemusu 側の PR）
- テスト: unit（`buildPosts` / `classify` / `jstDay` / 契約テスト）。e2e は増やさない（受け側に届かない。`/cdn-cgi/handler/scheduled` でローカル発火しても env 無しでスキップするだけ）
- 据え置き: 送った後の訂正・削除の反映（受け側に口が無い）、家族それぞれの日記への接続（PAT を利用者ごとに預かる別設計 — skill `cloudflare-workers-pat-bearer-auth`「Another app, per user」）、UI の送信状態

## 却下した選択肢

- **記録時のイベント駆動（`waitUntil` で即送る）** — §1。日ごとにまとめられず、訂正・削除の猶予も無い
- **手動の「kokemusu に送る」ボタン** — 定期投稿という要望に合わない
- **Cron の全面解禁** — 要る機能はこれ 1 本。orphan 掃除などは引き続き持たない（ADR-004 §6）
- **user id を secret に置く / DB に印を立てる（`kokemusu_senders`）** — §2。秘密でない値を secret にすると読み返せない。DB の印は将来複数人が繋ぐときの形で、PAT が 1 つの今は要らない
- **自分が owner のスペースだけ** — §2。軸は作った人
- **一人で作った回だけ** — §2。二人で作った回も「作った」
- **1 品 1 苔片** — §3。日記の苔片が料理の数だけ増える
- **本文に ♥・食材タグ・一緒に作った人・メモ** — §4。持ち主の選択（最小限）
- **tags に `matatabetai` を足す** — §4。要望は `料理` だけ
- **台帳を持たず時間の窓（`created_at` が前日）で選ぶ** — §5。作った人を後から足した編集を拾えず、Cron の二重発火で二重投稿する
- **`meals.kokemusu_posted_at` 列** — §5。失敗を持てず、連携の都合で `meals` を触る
- **リトライしない（mazuoboeru 踏襲）** — §6。台帳があるので送り直しが安い
- **受け側に Idempotency-Key を頼む** — 受け側が「必要になってから」と決めている（kokemusu ADR-0002）。二重投稿の受容で足りる
- **Queues / Workflows** — 1 晩数 POST・数百 ms に過剰（mazuoboeru と同じ判断）
- **`kind` を送らない（未分類）** — 持ち主の選択で `output`

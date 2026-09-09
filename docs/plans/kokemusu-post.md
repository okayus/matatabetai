# kokemusu への定期投稿（grill 待ち）

持ち主の日記 kokemusu に、またたべたいの記録から「自分が作った料理」を積みたい（2026-09-09、持ち主の要望）。
grill で形が決まり ADR に落ちたら、このファイルは消して `docs/status.md` の 3 手に入れる。

## 何を送るか（要望）

- 毎日の記録（`meals`）を**「作った人」**（[ADR-012](../adr/012-meal-cooks.md) `meal_cooks`）で絞り、**その人が作った料理**を kokemusu に投稿する。
- タグは当面 **`料理`** だけ。
- 前例は mazuoboeru の日次 push（[ADR-0017](https://raw.githubusercontent.com/okayus/mazuoboeru/main/docs/adr/0017-daily-digest-push-to-kokemusu.md)）。
  受け側の契約は kokemusu の [`docs/senders.md`](https://raw.githubusercontent.com/okayus/kokemusu/main/docs/senders.md)
  （sandbox から raw GitHub で読める。**転記しない**。`posts.schema.json` を vendoring して builder を `z.fromJSONSchema` で契約テストする）。

## grill で決めること

- **定期実行の形**: CLAUDE.md「Cron Triggers は当面持たない」を覆して日次 cron にするか、記録時のイベント駆動 push にするか。
  どちらでも `firstDay` に食べた日（`eaten_on`）を入れられる（苔片は送った日ではなく在った日に積まれる）。
- **「作った人」の指定**: `users` に持ち主の印は無く、`spaces` にも owner 列は無い → var（例 `KOKEMUSU_COOK_USER_ID`）で 1 人を指す。
- **対象 space**: 参加先は複数あり得る。その人が作った料理を全 space から拾うか、自分が作った space だけか。
- **粒度**: 1 日に複数品なら 1 品 1 苔片か、1 日 1 苔片にまとめるか。本文の形（料理名・タグ・URL。写真は送らない）。
- **作った人が複数**（ADR-012 は複数可）のときに含めるか。家族の記録（その人が作っていないもの）は送らない。
- **PAT**: kokemusu で発行 → ホストで `wrangler secret put KOKEMUSU_PAT`、URL は `vars` にコミット（mazuoboeru と同じ置き方）。

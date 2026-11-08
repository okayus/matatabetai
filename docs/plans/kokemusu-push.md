# kokemusu への日次投稿 — 実装と人手の段取り（ADR-013）

決めは [ADR-013](../adr/013-kokemusu-daily-push.md)。本番で 1 晩回って kokemusu に石が立ったら、このファイルは消して log に 1 行。

## コンテナ（実装 PR。`drizzle/` を含むので関門のある PR。merge の直前に持ち主が bookmark を PR にコメントする — CLAUDE.md）

- migration `0008_kokemusu_posts`: `CREATE TABLE kokemusu_posts` + `CREATE INDEX meal_cooks_user_id_idx`（additive）。PR 本文に事後確認の SQL を書く
- `wrangler.jsonc`: `triggers.crons: ["15 15 * * *"]`、`services: [{ "binding": "KOKEMUSU", "service": "kokemusu" }]`、`vars.KOKEMUSU_URL` = `https://kokemusu.shiraoka.workers.dev`、`vars.KOKEMUSU_COOK_USER_ID`（人間からもらう）、`observability` ON。`pnpm types` を流し直す
- **送信は Service Binding で行う**（2026-11-09 改訂。2026-09-21 には互換フラグ `global_fetch_strictly_public` と書いていた）。matatabetai と kokemusu は同じ `shiraoka.workers.dev` にいて、同じ zone の別の Worker へのグローバル `fetch()` は相手に届かず、404（`error code: 1042`）が返る。mazuoboeru の日次投稿は、このフラグ（okayus/mazuoboeru#105）では届かず、Service Binding（#106）で届いた（kokemusu の D1 で 11-07 まで到着を確認）。境界は URL・method・Bearer・本文を公開の呼び出しと同じにし、経路だけを `env.KOKEMUSU.fetch()` に変える（URL は `KOKEMUSU_URL` + `/api/posts`。skill `cloudflare-workers-pat-bearer-auth` 0.4.0 の 1042 の節）。binding は同じアカウントの `kokemusu` という Worker に deploy を結びつけ、受け側には `CF-Connecting-IP` が来ない。単体テストと契約テストは fetch を差し替えるので、経路の誤りは検出できない
- `worker/index.ts` に `scheduled`（`event.cron` で分岐）。`worker/kokemusu/`: 純粋 `jstDay` / `buildPosts` / `classify` + throw しない `postToKokemusu`（binding を受け取る。status と、非 2xx なら応答本文の先頭 160 字をログに出す。token と送る本文は出さない — `error code: 1042` は本文が名乗る）。`worker/env.ts` の `Secrets` に `KOKEMUSU_PAT?`
- `pnpm kokemusu:schema`（`curl -fsSL` → `worker/kokemusu/posts.schema.json`）+ 契約テスト（`z.fromJSONSchema`）。unit は builder / classify / jstDay
- `.dev.vars.example` にキー名だけ。ローカルと e2e には値を置かない
- ローカル発火の確認: `curl "http://localhost:5173/cdn-cgi/handler/scheduled?cron=15+15+*+*+*"` → env 無しで skip のログ 1 行

## 人間（ホスト）

1. kokemusu の設定画面で PAT を発行（名前 `matatabetai`、scope `post:write`）→ 値を表示してから `packages/web/node_modules/.bin/wrangler secret put KOKEMUSU_PAT` に貼る（pipe しない）
2. smoke: `curl -s https://kokemusu.shiraoka.workers.dev/api/auth/me -H "Authorization: Bearer <PAT>"` → `{ id, displayName }`
3. 自分の user id（アカウント画面 / `GET /api/auth/me`）をコンテナに伝える → `vars.KOKEMUSU_COOK_USER_ID` にコミット
4. shiraoka アカウントの Cron 本数（Free は 5。mazuoboeru が 2 本）
5. merge の直前に `node ~/.config/d1-backup/d1-bookmark.mjs matatabetai <PR番号>` を打ち、D1 Time Travel の bookmark を PR にコメントする（CLAUDE.md の関門。24 時間以内のものを hook `guard-pr-merge` も確かめる）。merge 翌朝: kokemusu に `料理` の石、observability に `[kokemusu] POST /api/posts -> 201`（`-> 401` は届いたが PAT が違う）
6. kokemusu の `docs/senders.md`「公開されている送り側」に matatabetai を足す（kokemusu 側の PR）

- **配備後の実測（省かない）**: 最初の活動日の翌 00:15 JST に、kokemusu の PAT の「最終利用」（`api_token.last_used_at`）が進むことと、その日の石が立つことを確かめる。ホストの `curl` が通ることは、Worker からの `fetch` が通ることの証拠にならない（経路が違う）。石の存在だけでも証拠にならない（作成時刻が 00:15 台かを見る）

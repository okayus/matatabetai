# kokemusu への日次投稿 — 実装と人手の段取り（ADR-013）

決めは [ADR-013](../adr/013-kokemusu-daily-push.md)。本番で 1 晩回って kokemusu に石が立ったら、このファイルは消して log に 1 行。

## コンテナ（実装 PR。`drizzle/` を含むので人間 merge、PR 本文にバックアップ手順）

- migration `0008_kokemusu_posts`: `CREATE TABLE kokemusu_posts` + `CREATE INDEX meal_cooks_user_id_idx`（additive）
- `wrangler.jsonc`: `triggers.crons: ["15 15 * * *"]`、`vars.KOKEMUSU_URL` = `https://kokemusu.shiraoka.workers.dev`、`vars.KOKEMUSU_COOK_USER_ID`（人間からもらう）、`observability` ON。`pnpm types` を流し直す
- `worker/index.ts` に `scheduled`（`event.cron` で分岐）。`worker/kokemusu/`: 純粋 `jstDay` / `buildPosts` / `classify` + throw しない `postToKokemusu`（status だけログ）。`worker/env.ts` の `Secrets` に `KOKEMUSU_PAT?`
- `pnpm kokemusu:schema`（`curl -fsSL` → `worker/kokemusu/posts.schema.json`）+ 契約テスト（`z.fromJSONSchema`）。unit は builder / classify / jstDay
- `.dev.vars.example` にキー名だけ。ローカルと e2e には値を置かない
- ローカル発火の確認: `curl "http://localhost:5173/cdn-cgi/handler/scheduled?cron=15+15+*+*+*"` → env 無しで skip のログ 1 行

## 人間（ホスト）

1. kokemusu の設定画面で PAT を発行（名前 `matatabetai`、scope `post:write`）→ 値を表示してから `packages/web/node_modules/.bin/wrangler secret put KOKEMUSU_PAT` に貼る（pipe しない）
2. smoke: `curl -s https://kokemusu.shiraoka.workers.dev/api/auth/me -H "Authorization: Bearer <PAT>"` → `{ id, displayName }`
3. 自分の user id（アカウント画面 / `GET /api/auth/me`）をコンテナに伝える → `vars.KOKEMUSU_COOK_USER_ID` にコミット
4. shiraoka アカウントの Cron 本数（Free は 5。mazuoboeru が 2 本）
5. merge 前に D1 export（runbook）。merge 翌朝: kokemusu に `料理` の石、observability に `[kokemusu] POST /api/posts -> 201`
6. kokemusu の `docs/senders.md`「公開されている送り側」に matatabetai を足す（kokemusu 側の PR）

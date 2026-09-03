# e2e（Playwright）

配線と「存在の事実」だけを見る 4 spec。ドメインの意味は `worker/**/*.test.ts`（vitest）。

- `golden-path` — 初回登録 → リロードで残る → 招待リンク → 別ブラウザが招待から参加 → メンバーに並ぶ → ログアウト → ログイン
- `authorization-boundary` — 他スペースは API 404（本文固定）+ UI のアクセス拒否
- `link-preview` — 投稿 → 応答後の OGP 取得 → カード（画像は private R2 経由）/ 取れない URL はプレーンリンクのまま
- `security-headers` — CSP / X-Frame-Options / nosniff / Referrer-Policy が `/`・`/api`・`/health` に付く、未知の `/api/*` が JSON、CSRF Origin 検査

## 動かし方（コンテナ内）

```bash
pnpm e2e            # build → wrangler dev（127.0.0.1:5183、ビルド成果物）→ 4 spec
pnpm e2e:server     # サーバーだけ立てておく（2 回目以降の pnpm e2e が速い。reuseExistingServer）
```

- **ローカル D1 の dev データは全消しされる**（global-setup が `DELETE` してから他家族を seed する）
- `.dev.vars` は使わない。`e2e:server` が `--var` で `ORIGIN` / `RP_ID=localhost` / `SESSION_SECRET` / `INITIAL_REGISTRATION_TOKEN` を渡す（`playwright.config.ts` と同じ値）
- `link-preview` の「外部サイト」は `e2e/fixtures/site/` を `dist/client/e2e-fixture/` に写したもの（`e2e:server` がコピーする）。本番のビルド成果物には入らない
- `pnpm dev`（5173）とは別ポートなので同居できる
- CI では回さない（`playwright.config.ts` の冒頭）。merge 前にここで流す

## 詰まったら

| 症状 | 原因 |
|---|---|
| `D1_ERROR: no such table` | `--persist-to .wrangler/state` が外れて dist 相対の空 DB を見ている |
| `Executing inline script violates CSP` | `vite dev` に向いている。ビルド成果物を配信すること |
| verify が `challenge_mismatch`、begin は 200 | `ORIGIN` と `baseURL` の不一致（scheme / host / port） |
| 接続はできるが応答が来ない | `--ip 127.0.0.1` が外れている（localhost bind はコンテナで止まる） |
| `browser not found` | image の chromium と `@playwright/test` の版ずれ。docker-compose.yml の `PLAYWRIGHT_VERSION` と揃えて rebuild |

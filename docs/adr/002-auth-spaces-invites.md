# ADR-002: 認証・スペース・招待の実装で確定した決定

- ステータス: 承認
- 日付: 2026-08-30

## コンテキスト

ADR-001 §2–3 の方針（passkey 限定の招待制、per-space membership、single-use 招待リンク）を skill `cloudflare-workers-passkey-auth` / `cloudflare-workers-space-membership-invite` に沿って実装した。本プロジェクトは両 skill の最初の利用者で、`UNVERIFIED:` 項目を検証して skill に書き戻した（passkey-auth 0.2.0 / space-membership-invite 0.2.0 / e2e-playwright 0.2.1）。skill から逸れた判断と、requirements.md の「ドメインモデル（草案）」のうち認証・スペース部分の確定をここに記録する。

## 決定

### 1. スキーマ（requirements.md 草案の確定）

`users` / `credentials` / `sessions` / `spaces` / `space_members` / `invites` を skill の列定義どおりに持つ（`packages/web/worker/db/schema.ts`）。`role` の制約は drizzle の `check()` で宣言し、drizzle-kit 0.31 がそのまま `CHECK` を出す（手書き不要）。migration は `pnpm db:generate -- --name <summary>` で生成し、適用は従来どおり `wrangler d1 migrations apply`。手書きだった `0000_init.sql` は空スキーマのスナップショットとして drizzle-kit の journal に載せ（`--custom` で一度生成して SQL だけ git から復元）、`0001_auth_spaces.sql` から生成物にした。

### 2. クライアントは WebAuthn のブラウザ標準 JSON API を直接呼ぶ

`PublicKeyCredential.parseCreationOptionsFromJSON` / `parseRequestOptionsFromJSON` と `credential.toJSON()`（Baseline Newly available 2025-03）を使い、`@simplewebauthn/browser` は入れない。`modern-web-guidance`（passkeys）がラッパー不使用を指示していること、依存が 1 つ減ること、JSON の型は `@simplewebauthn/server` から type-only import すればサーバーと揃うことによる。Signal API（`signalUnknownCredential` / `signalAllAcceptedCredentials` / `signalCurrentUserDetails`）は feature-detect して対応ブラウザでだけ呼ぶ。polyfill は入れない（CLAUDE.md フロントエンド方針）。

### 3. CSP はスキームで分ける

`ORIGIN` が https なら strict（`script-src 'self'`、`style-src 'self'`、HSTS あり）、http（`vite dev` / e2e）なら `'unsafe-inline'` と `ws:` を足す。Vite dev の HMR preamble（inline script）と `<style>` 注入が strict CSP と衝突するためで、本番 ORIGIN は https なので緩和は漏れない。e2e は http 形を断定し、strict 形はユニットテスト（`worker/lib/csp.test.ts`）で固定する。

### 4. 認可 URL と「自分のスペースは 1 つ」

スペース配下は `/api/spaces/:spaceId/...` に置き、`spaceMiddleware` が所属を 1 回だけ確かめる（不正 id・未存在・所属外はすべて `404 {"error":{"type":"not_found"}}`）。owner 判定は handler の中。`POST /api/spaces`（招待で入った人が自分のスペースを作る）は `INSERT … SELECT … WHERE NOT EXISTS (owner の membership)` を batch の先頭に置き、同時実行でも 2 つ作れない（0 行なら `409 already_owner`）。

### 5. セッションと cookie

HS256 JWT（`sid`）+ `sessions` 行（真実はこちら。logout は行の削除）、30 日のスライド延長（残り半分を切ったら）。cookie 名と `Secure` は ORIGIN のスキームから導く（https は `__Host-session` / `__Host-challenge`）。**削除も同じ属性で行う**（Hono は `__Host-` 名で `secure` が無いと throw する。skill のテンプレートを修正して還元）。

### 6. CSRF は Origin 検査、rate limit は Phase 4

非 GET の `/api/*` は `Origin === ORIGIN` を要求する。認証 4 route の rate limit（`ratelimits` binding）は roadmap Phase 4 に残す — binding があると credential-free の `wrangler dev` が止まる（skill `playwright-e2e-in-docker-sandbox`）ので、bot 対策と一緒に e2e 側の config 剥がしごと入れる。

### 7. ルーターは自前、招待トークンはフラグメント

`pathname` の購読と `matchPath` だけの自前ルーター（`src/router.ts`）。画面は 6 つで、ネストや loader は要らない。招待リンクは `/invite#token=<hex>` — フラグメントはサーバーログにも Referer にも乗らず、着地後に `history.replaceState` で消す。

### 8. テストの置き方

ユニットは純粋関数だけ（vitest、IO なし）。配線は Playwright 3 spec（初回登録 → リロード → 招待 → 別ブラウザで参加 → ログアウト → ログイン／他スペース 404／セキュリティヘッダ）をコンテナ内で `wrangler dev`（ビルド成果物、`--ip 127.0.0.1`、ブラウザ側は `localhost`）に対して流す。CI では回さない（skill の方針。merge 前に手元で流す）。

## 影響

- deploy 前に `SESSION_SECRET`、初回 owner 登録のときだけ `INITIAL_REGISTRATION_TOKEN` を put → 登録 → delete（2026-09-01 に実施済み、[log.md](../log.md)）。secret が無いと `/api/auth/*` は 500 になるが登録の扉は閉じたまま
- passkey を 1 つでも登録する前にドメインを確定する（ADR-001 §2、roadmap 決めること 4）。merge 後も `INITIAL_REGISTRATION_TOKEN` を put するまで登録は `403 registration_closed`
- 家族に薦めること: 登録直後に 2 台目（または同期されるパスキー）を追加する。最後のパスキーは消せない（`400 last_credential`）

## 却下した選択肢

- `@simplewebauthn/browser` — ブラウザ標準 API で足りる（§2）
- `react-router` — 6 画面に対して過大。必要になったら `matchPath` を置き換える
- `@cloudflare/vitest-pool-workers` での DB 統合テスト — ユニット / e2e の 2 層方針に反する。D1 の `batch()` の `meta.changes` と rollback は使い捨ての probe Worker で実測して skill に記録した
- dev で CSP を外す — スキーム分岐で本番の strict は保てる（§3）

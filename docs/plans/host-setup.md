# 計画: 人手でホストから済ませること（完了したら削除）

credential を扱う作業を人間がホストで行う。順は 認証 secret（#19 の前後）→ Workers Builds → R2。済んだ節は削除して `docs/log.md` に 1 行、全部済んだらこのファイルごと削除（番号は参照が壊れないよう詰めない）。

## 6. 認証の本番 secret と初回 owner 登録（ADR-002）

**#19 の merge 前後どちらでも**（ホスト、`packages/web` で、`wrangler login` 済み。無い間は `/api/auth/*` の署名を伴う経路が 500 になるだけで、登録の扉は閉じたまま）:

```bash
openssl rand -hex 32 | pnpm exec wrangler secret put SESSION_SECRET   # session JWT と challenge cookie の署名鍵。一度だけ
pnpm exec wrangler secret list                                         # SESSION_SECRET だけ
```

backup は今回不要（本番 D1 にデータが無く、0001 は CREATE TABLE / INDEX のみで rebuild なし）。データの入った表を触る migration から skill `cloudflare-d1-drizzle-migration` の runbook に従う。

merge → Deploy 完了後: `curl -s https://matatabetai.shiraoka.workers.dev/health`、`curl -s -X POST https://matatabetai.shiraoka.workers.dev/api/auth/register/begin -H 'Origin: https://matatabetai.shiraoka.workers.dev' -H 'Content-Type: application/json' -d '{"displayName":"x"}'` が `{"error":{"type":"registration_closed"}}`（扉は閉じている）。

**初回 owner 登録**（roadmap 決めること 4 = ドメインを確定してから。passkey 登録後のホスト変更は破壊的）:

```bash
openssl rand -hex 32 | pnpm exec wrangler secret put INITIAL_REGISTRATION_TOKEN
# → スマホで https://matatabetai.shiraoka.workers.dev/register を開き、表示名 + トークン → パスキー作成
pnpm exec wrangler secret delete INITIAL_REGISTRATION_TOKEN                                     # 登録できたらすぐ閉じる
pnpm exec wrangler d1 execute matatabetai --remote --command "SELECT u.display_name, s.name, sm.role FROM space_members sm JOIN users u ON u.id = sm.user_id JOIN spaces s ON s.id = sm.space_id"
```

そのあと アカウント画面で 2 台目のパスキーを追加 → スペース設定の「招待リンクを作る」で家族を招待（7 日・1 回）。

## 4. Workers Builds 接続（skill `cloudflare-workers-builds-keyless-deploy` 0.3.0、`references/dashboard-walkthrough.md`）

**Pre-flight（ターミナル）**:

```bash
git fetch origin && git ls-tree --name-only origin/main packages/web/wrangler.jsonc   # パスが出ること
gh pr list --state open                                                              # 未 merge の骨格 PR が無いこと
grep -n '"name"\|database_id' packages/web/wrangler.jsonc; wrangler d1 list         # name = matatabetai、database_id = 実在の UUID
wrangler whoami                                                                      # dash にログインするのと同じアカウント
wrangler deployments list                                                            # 既存 Worker `matatabetai`（GH Actions deploy 済み）が出る = Workers Builds が引き継ぐ
```

**dash（値）**: Project name = `matatabetai` / Build command = `pnpm install --frozen-lockfile && pnpm run build` / Deploy command = `pnpm exec wrangler d1 migrations apply matatabetai --remote && pnpm exec wrangler deploy` / **非本番ブランチのビルド = OFF** / 詳細設定 → パス（Root directory）= `packages/web` / API トークン = **「新しいトークンを作成する」**で `matatabetai Workers Builds`（picker 既定の他プロジェクトのトークンを選ばない。My Profile で先に作らない）→ デプロイ。初回は手動ビルドで GitHub に check-run が付かない（missed trigger ではない）。Settings → Builds → Build watch paths の除外に `docs/*` と `*.md`。

**接続後（ホストから push）**: `.github/workflows/deploy.yml` を削除する PR（workflow ファイルは token で push できない）→ merge で push 起動ビルドを実証（`Workers Builds: matatabetai` の check-run）→ `gh secret delete CLOUDFLARE_API_TOKEN` と `gh secret delete CLOUDFLARE_ACCOUNT_ID` → My Profile の旧 `CLOUDFLARE_API_TOKEN` 用トークンを削除 → `docs/roadmap.md` Phase 1 の該当項目にチェック。dash 生成トークンは D1 / R2 edit を含む（2026-08-23 時点）。

## 5. R2 bucket

`wrangler r2 bucket create matatabetai-photos`（ホスト、`wrangler login` 済み）。Workers Builds 移行前に写真機能を deploy するなら `CLOUDFLARE_API_TOKEN` に `Workers R2 Storage: Edit` を in-place 追加（skill `cloudflare-api-token-permissions`）。移行後は不要。

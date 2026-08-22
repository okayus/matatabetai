# ローカル開発ガイド

## サンドボックス開発（標準の開発形態, ADR-001）

`pnpm install`・ビルド・テスト・Claude Code は **egress 制限つきコンテナ内**で実行する。ホストで `pnpm install` しない（サプライチェーン対策。構成は okayus-skills `claude-code-docker-sandbox` skill のまま）。

```bash
eval $(op signin)               # 1Password CLI のセッション（desktop app 統合があれば不要。30 分で切れる）
./up.sh                         # = op run --env-file=.docker/sandbox.env -- docker compose up -d。初回は build に数分
docker compose logs dev | grep -i 'firewall\|WARN\|NOTE'   # "Firewall verification passed" が 2 行。NOTE: GH_TOKEN absent が出たら token 未注入
docker compose exec dev zsh     # コンテナに入る (workspace = リポジトリ root)
```

- ホスト側は**エディタと git だけ**（bind mount なので編集は即時反映）。コンテナに Cloudflare の credential は入れない（`wrangler login` もしない）
- コンテナが持つ credential は **matatabetai 1 リポ限定の GitHub fine-grained PAT** だけ（Contents + Pull requests、Workflows なし、90 日）。`./up.sh` が 1Password から解決して env にだけ注入し、git の credential helper は env を echo する inline 関数、`gh` は `GH_TOKEN` を直接読む。**`docker compose up -d` を直接叩くと token なしで起動する**（commit はできるが push できない = fail closed）。`docker compose restart` は env を保つが `down` 後は `./up.sh` が要る。skill `sandboxed-agent-github-token-via-1password`
- dev サーバーはコンテナ内で `pnpm dev -- --host 0.0.0.0` → ホストのブラウザから **http://localhost:5573/**（5173 = 汎用 Vite、5273 = kokemusu、5373 = mazuoboeru、5473 = nyalog と衝突しないため）
- コンテナ内 `claude` の初回認証は OAuth URL をホストブラウザで開いてコードを貼る。auth は named volume `matatabetai_claude-config` に永続化され `docker compose down` でも消えない。project MCP（`cloudflare-docs` / `context7`）は初回に対話セッションで trust 承認が要る（`claude mcp list` が `⏸ Pending approval` → 承認後 `✔ Connected`）
- コンテナ内の claude は `bypassPermissions` が既定（起動 command が container-scope の settings に書く）。その下でも `.claude/settings.json` の **deny**（force push・`main` への push・`--delete`・`gh pr merge`・`gh auth`・`gh api`）は効く。allow は bypass では無効（ホスト側セッション向け）
- 新しい外部ドメインに繋ぐ必要が出たら `.docker/init-firewall.sh` の allowlist に追記 → `docker compose down && docker compose build && ./up.sh`。FATAL list は解決できないと起動が止まるので最小限に。docs サイトは OPTIONAL list へ
- `docker compose` は**プロジェクト直下で `-f` なしで実行**する。`-f` を付けると `docker-compose.override.yml`（okayus-skills のマウント）が黙って外れる

## 公式ドキュメントへのアクセス（3 層）

firewall は default-deny なので「docs を見に行く」には経路が要る（skill `cloudflare-mcp-claude-tooling`）。

1. **MCP**: `cloudflare-docs`（Cloudflare 公式、認証不要）と `context7`（`https://mcp.context7.com/mcp`、キー不要。MDN・Hono・Drizzle・React・Vite・Cloudflare Workers を横断）
2. **WebFetch**: OPTIONAL allowlist のホストだけ取得できる — `developer.mozilla.org` `react.dev` `hono.dev` `orm.drizzle.team` `vite.dev` `vitest.dev` `zod.dev` `developer.chrome.com` `web.dev` `developers.cloudflare.com`。`llms.txt` を持つサイト（hono / drizzle / react / vite / vitest / zod / cloudflare）は目次から入る
3. **WebSearch**: Anthropic 側で実行されるので egress 不要（タイトルと URL だけ返る）

`modern-web-guidance`（Google Chrome、Apache-2.0）は project scope `.claude/skills/modern-web-guidance/` に同梱。HTML / CSS / UI を書く前に `search` で引く（`npx -y modern-web-guidance@latest …` を実行する。registry は FATAL allowlist 済み）。更新は `npx skills update`、出自は `skills-lock.json`。

## okayus-skills のマウント（読み書き可）

`docker-compose.override.yml`（gitignored）が `../okayus-skills/skills` を `~/.claude/skills` に **rw** でマウントする。コンテナ内で skill を直すと、ホストの `okayus-skills` 作業ツリーに直接反映される。commit / PR は `cd ../okayus-skills` でホストから行う。還元が一巡したら `:ro` に戻してよい。

## Playwright e2e

chromium は image に焼き込み済み（`PLAYWRIGHT_VERSION` build arg = `1.62.1`。1.59.1 は node:24 だと `install chromium` がダウンロード完了直後に永遠に止まる（node:22 では問題なし、2026-08-22 確認）ので使わない）。web パッケージの `@playwright/test` を同じバージョンに pin し、上げるときは両方を同時に上げて `docker compose build`。実行方法は okayus-skills `cloudflare-workers-e2e-playwright` / `playwright-e2e-in-docker-sandbox` を参照（`wrangler dev --persist-to .wrangler/state --ip 127.0.0.1`、rate-limit binding を外した e2e 用 config）。

## GitHub token の運用

- **発行**: GitHub → Settings → Developer settings → Fine-grained tokens。Resource owner = 自分、Repository access = `okayus/matatabetai` のみ、Contents: Read and write、Pull requests: Read and write（任意で Actions: Read）、**Workflows は付けない**、期限 90 日
- **保管**: GitHub の画面から直接 1Password へ。`op item create --category "API Credential" --vault "Private" --title "github-pat-matatabetai-sandbox" 'credential=<token>' 'expires=<YYYY-MM-DD>'`。item 名は **1 リポ 1 タイトル**（他プロジェクトの item 名をコピペしない — `op item list --vault Private | grep github-pat-` で確認）
- **ローテーション**: 90 日ごと、または疑いがあれば即時。GitHub で Regenerate → `op item edit … 'credential=<new>' 'expires=<date>'` → `./up.sh`
- **期限切れの症状**: コンテナ内の `git push` が `remote: Invalid username or token`。`op item get github-pat-matatabetai-sandbox --fields label=expires` を先に見る
- **やらないこと**: `gh auth login`（token をディスクに書く）、`git config credential.helper store`、`echo $GH_TOKEN`、token 入りの remote URL

## トラブルシューティング

- **起動ログで `Failed to resolve <domain>`** → FATAL allowlist のドメインが解決できない。一時的な DNS なら `docker compose restart`、恒久なら allowlist を見直す
- **`NOTE: GH_TOKEN absent`** → `./up.sh` を通していない。`docker compose down` → `eval $(op signin)` → `./up.sh`
- **ホストで `pnpm` を叩いて hook に止められた** → `docker compose exec dev pnpm …` に書き換える（`.claude/hooks/require-container.py`）
- **`claude` の `/model` に Fable 系が出ない** → `DISABLE_TELEMETRY` を compose env に足していないか確認（Statsig を塞ぐと flag-gated model が隠れる）
- **Context7 が応答しない** → `mcp.context7.com` は AWS ELB で IP が変わる。firewall は起動時に解決するので `docker compose restart`

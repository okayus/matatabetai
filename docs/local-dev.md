# ローカル開発ガイド

## サンドボックス開発（標準の開発形態, ADR-001）

`pnpm install`・ビルド・テスト・Claude Code は **egress 制限つきコンテナ内**で実行する。ホストで `pnpm install` しない（サプライチェーン対策。構成は okayus-skills `claude-code-docker-sandbox` skill のまま）。

```bash
./up.sh                         # = docker compose up -d（資格情報なし・冪等・何度打っても安全）。初回は build に数分
docker compose logs dev | grep -i 'firewall\|WARN\|NOTE'   # "Firewall verification passed" が 2 行
eval $(op signin)               # 1Password CLI のセッション（desktop app 統合があれば不要。30 分で切れる。↓ の shell.sh 用）
./shell.sh                      # token 付きでコンテナに入る (workspace = リポジトリ root)
docker exec -it matatabetai-dev zsh   # token 無しで入りたいとき
```

- ホスト側は**エディタと git だけ**（bind mount なので編集は即時反映）。コンテナに Cloudflare の credential は入れない（`wrangler login` もしない）
- credential は **matatabetai 1 リポ限定の GitHub fine-grained PAT** だけ（Contents + Pull requests、Workflows なし、90 日）。**`./shell.sh` が 1Password から解決して、そのシェル（と子プロセス = claude / git / gh）の env にだけ注入する**。git の credential helper は env を echo する inline 関数、`gh` は `GH_TOKEN` を直接読む。**`docker exec` で直に入ったシェルには token が無い**（commit はできるが push できない = fail closed）。コンテナ設定にも PID 1 にも載らないので `./up.sh` は何度打っても安全。skill `sandboxed-agent-github-token-via-1password` 0.2.0
- ⚠️ **2026-08-23 改訂（ADR-001）**: 以前は token を compose の `environment:` に入れて `./up.sh` で注入していた。それだと token が**コンテナ設定の一部**になり、op を通さない `docker compose up -d` が「設定変更」と判定されて[コンテナごと作り直される](https://docs.docker.com/reference/cli/docker/compose/up/)＝ token 消失 + 中の Claude セッションも死ぬ（kokemusu で実測）。注入を exec 時に移して切り離した
- **確認**: `./shell.sh` の中で `test -n "$GH_TOKEN" && echo "len=${#GH_TOKEN}"`（93 文字。値は印字しない）。コンテナ設定に無いことは `docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' matatabetai-dev | grep -c '^GH_TOKEN'` → `0`。⚠️ ホストで `op run -- env` を見ると値は `<concealed by 1Password>`（ちょうど 24 文字）にマスクされるので「24 文字 = 壊れている」ではない
- 初回は `cp packages/web/.dev.vars.example packages/web/.dev.vars` して `SESSION_SECRET`（`openssl rand -hex 32`）と `INITIAL_REGISTRATION_TOKEN`（任意の文字列）を埋め、`pnpm db:migrate` でローカル D1 に migration を当てる。`ORIGIN=http://localhost:5573` はホストのブラウザで開く URL に合わせる（CSRF と WebAuthn の origin 検査がこれと比較する）
- dev サーバーはコンテナ内で `pnpm dev -- --host 0.0.0.0` → ホストのブラウザから **http://localhost:5573/**（5173 = 汎用 Vite、5273 = kokemusu、5373 = mazuoboeru、5473 = nyalog と衝突しないため）
- コンテナ内 `claude` の初回認証は OAuth URL をホストブラウザで開いてコードを貼る。auth は named volume `matatabetai_claude-config` に永続化され `docker compose down` でも消えない。project MCP（`cloudflare-docs` / `context7`）は初回に対話セッションで trust 承認が要る（`claude mcp list` が `⏸ Pending approval` → 承認後 `✔ Connected`）
- コンテナ内の claude は `bypassPermissions` が既定（起動 command が container-scope の settings に書く）。その下でも `.claude/settings.json` の **deny**（force push・`main` への push・`--delete`・`gh auth`・`gh api`）は効く。allow は bypass では無効（ホスト側セッション向け）。merge は deny ではなく運用で縛る — `gh pr merge --auto --squash` のみ・例外は CLAUDE.md 参照（サーバー側の境界は ruleset、ADR-001 改訂 2026-08-24）
- 新しい外部ドメインに繋ぐ必要が出たら `.docker/init-firewall.sh` の allowlist に追記 → `docker compose down && docker compose build && ./up.sh`。FATAL list は解決できないと起動が止まるので最小限に。docs サイトは OPTIONAL list へ
- `docker compose` は**プロジェクト直下で `-f` なしで実行**する。`-f` を付けると `docker-compose.override.yml`（okayus-skills のマウント）が黙って外れる
- セッション開始時に `.claude/hooks/session-start.sh` が `docs/status.md` と `docs/log.md` の先頭を注入する（コンテナでも同じ — リポ内のファイルなので再ビルド不要）。auto memory と session はホストとコンテナで別々なので、両方が知るべきことはリポ（status hub / ADR）に書く

## 公式ドキュメントへのアクセス（3 層）

firewall は default-deny なので「docs を見に行く」には経路が要る（skill `cloudflare-mcp-claude-tooling`）。

1. **MCP**: `cloudflare-docs`（Cloudflare 公式、認証不要）と `context7`（`https://mcp.context7.com/mcp`、キー不要。MDN・Hono・Drizzle・React・Vite・Cloudflare Workers を横断）
2. **WebFetch**: OPTIONAL allowlist のホストだけ取得できる — `developer.mozilla.org` `react.dev` `hono.dev` `orm.drizzle.team` `vite.dev` `vitest.dev` `zod.dev` `developer.chrome.com` `web.dev` `developers.cloudflare.com`。`llms.txt` を持つサイト（hono / drizzle / react / vite / vitest / zod / cloudflare）は目次から入る
3. **WebSearch**: Anthropic 側で実行されるので egress 不要（タイトルと URL だけ返る）

`modern-web-guidance`（Google Chrome、Apache-2.0）は project scope `.claude/skills/modern-web-guidance/` に同梱。HTML / CSS / UI を書く前に `search` で引く（`npx -y modern-web-guidance@latest …` を実行する。registry は FATAL allowlist 済み）。更新は `npx skills update`、出自は `skills-lock.json`。

## okayus-skills のマウント（読み書き可）

`docker-compose.override.yml`（gitignored）が `../okayus-skills/skills` を `~/.claude/skills` に **rw** でマウントする。コンテナ内で skill を直すと、ホストの `okayus-skills` 作業ツリーに直接反映される。commit / PR は `cd ../okayus-skills` でホストから行う。還元が一巡したら `:ro` に戻してよい。

## Playwright e2e

chromium は image に焼き込み済み（`PLAYWRIGHT_VERSION` build arg = `1.62.1`。1.59.1 は node:24 だと `install chromium` がダウンロード完了直後に永遠に止まる（node:22 では問題なし、2026-08-22 確認）ので使わない）。web パッケージの `@playwright/test` を同じバージョンに pin し、上げるときは両方を同時に上げて `docker compose build`。

```bash
pnpm e2e          # build → wrangler dev（ビルド成果物、127.0.0.1:5183）→ 3 spec（初回登録〜招待〜ログイン / 他スペース 404 / セキュリティヘッダ）
pnpm e2e:server   # サーバーだけ立てておくと 2 回目以降が速い
```

ローカル D1 の dev データは**全消し**される（global-setup）。vars は `--var` で渡すので `.dev.vars` は使わない。詳細と詰まりどころは `packages/web/e2e/README.md`（skill `cloudflare-workers-e2e-playwright` / `playwright-e2e-in-docker-sandbox`）。CI では回さない — merge 前にここで流す。

## GitHub token の運用

- **発行**: GitHub → Settings → Developer settings → Fine-grained tokens。Resource owner = 自分、Repository access = `okayus/matatabetai` のみ、Contents: Read and write、Pull requests: Read and write（任意で Actions: Read）、**Workflows は付けない**、期限 90 日
- **保管**: GitHub の画面から直接 1Password へ。`op item create --category "API Credential" --vault "Private" --title "github-pat-matatabetai-sandbox" 'credential=<token>' 'expires=<YYYY-MM-DD>'`。item 名は **1 リポ 1 タイトル**（他プロジェクトの item 名をコピペしない — `op item list --vault Private | grep github-pat-` で確認）
- **ローテーション**: 90 日ごと、または疑いがあれば即時。GitHub で Regenerate → `op item edit … 'credential=<new>' 'expires=<date>'` → **新しい `./shell.sh` を開くだけ**（コンテナは無関係）
- **期限切れの症状**: コンテナ内の `git push` が `remote: Invalid username or token`。`op item get github-pat-matatabetai-sandbox --fields label=expires` を先に見る
- **やらないこと**: `gh auth login`（token をディスクに書く）、`git config credential.helper store`、`echo $GH_TOKEN`、token 入りの remote URL

## トラブルシューティング

- **起動ログで `Failed to resolve <domain>`** → FATAL allowlist のドメインが解決できない。一時的な DNS なら `docker compose restart`、恒久なら allowlist を見直す
- **コンテナ内で `git push` が `401` / `gh` が未ログイン** → `./shell.sh` 以外で開いたシェルにいる。`eval $(op signin)`（desktop app 統合があれば不要）→ `./shell.sh`。コンテナの作り直しは不要
- **`docker inspect` の `Config.Env` に `=` の無い裸の `GH_TOKEN` がある** → 旧方式の残骸。`grep -c '^GH_TOKEN=.'`（`=` の後に 1 文字以上）で確認する。`cut -d= -f1 | grep -c` は裸のキーを「注入済み」と誤答する
- **ホストで `pnpm` を叩いて hook に止められた** → `docker compose exec dev pnpm …` に書き換える（`.claude/hooks/require-container.py`）
- **`claude` の `/model` に Fable 系が出ない** → `DISABLE_TELEMETRY` を compose env に足していないか確認（Statsig を塞ぐと flag-gated model が隠れる）
- **Context7 が応答しない** → `mcp.context7.com` は AWS ELB で IP が変わる。firewall は起動時に解決するので `docker compose restart`

# ローカル開発ガイド

## サンドボックス開発（標準の開発形態, ADR-001）

`pnpm install`・ビルド・テスト・Claude Code は **egress 制限つきコンテナ内**で実行する。ホストで `pnpm install` しない（サプライチェーン対策。構成は okayus-skills `claude-code-docker-sandbox` skill のまま）。

```bash
docker compose up -d            # 初回は build に数分。logs に "Firewall verification passed" が 2 行出ること
docker compose logs dev | grep -i 'firewall\|WARN'
docker compose exec dev zsh     # コンテナに入る (workspace = リポジトリ root)
```

- ホスト側は**エディタと git だけ**（bind mount なので編集は即時反映）。コンテナに Cloudflare / GitHub の credential は入れない（`wrangler login` もしない）
- dev サーバーはコンテナ内で `pnpm dev -- --host 0.0.0.0` → ホストのブラウザから **http://localhost:5573/**（5173 = 汎用 Vite、5273 = kokemusu、5373 = mazuoboeru、5473 = nyalog と衝突しないため）
- コンテナ内 `claude` の初回認証は OAuth URL をホストブラウザで開いてコードを貼る。auth は named volume `matatabetai_claude-config` に永続化され `docker compose down` でも消えない
- コンテナ内の claude は `bypassPermissions` が既定（起動 command が container-scope の settings に書く）。`git push` は deny のまま
- 新しい外部ドメインに繋ぐ必要が出たら `.docker/init-firewall.sh` の allowlist に追記 → `docker compose down && docker compose build && docker compose up -d`。FATAL list は解決できないと起動が止まるので最小限に
- `docker compose` は**プロジェクト直下で `-f` なしで実行**する。`-f` を付けると `docker-compose.override.yml`（okayus-skills のマウント）が黙って外れる

## okayus-skills のマウント（読み書き可）

`docker-compose.override.yml`（gitignored）が `../okayus-skills/skills` を `~/.claude/skills` に **rw** でマウントする。コンテナ内で skill を直すと、ホストの `okayus-skills` 作業ツリーに直接反映される。commit / PR は `cd ../okayus-skills` でホストから行う。還元が一巡したら `:ro` に戻してよい。

## Playwright e2e

chromium は image に焼き込み済み（`PLAYWRIGHT_VERSION` build arg = `1.62.1`。1.59.1 は node:24 だと `install chromium` がダウンロード完了直後に永遠に止まる（node:22 では問題なし、2026-08-22 確認）ので使わない）。web パッケージの `@playwright/test` を同じバージョンに pin し、上げるときは両方を同時に上げて `docker compose build`。実行方法は okayus-skills `cloudflare-workers-e2e-playwright` / `playwright-e2e-in-docker-sandbox` を参照（`wrangler dev --persist-to .wrangler/state --ip 127.0.0.1`、rate-limit binding を外した e2e 用 config）。

## トラブルシューティング

- **起動ログで `Failed to resolve <domain>`** → FATAL allowlist のドメインが解決できない。一時的な DNS なら `docker compose restart`、恒久なら allowlist を見直す
- **ホストで `pnpm` を叩いて hook に止められた** → `docker compose exec dev pnpm …` に書き換える（`.claude/hooks/require-container.py`）
- **`claude` の `/model` に Fable 系が出ない** → `DISABLE_TELEMETRY` を compose env に足していないか確認（Statsig を塞ぐと flag-gated model が隠れる）

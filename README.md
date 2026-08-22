# Mata Tabetai

家族で食べたものを記録し、振り返って次に繋げる web アプリ。

Cloudflare Workers + D1 + R2 でホスティング（単一 Worker で SPA と API を配信）。本番: https://matatabetai.shiraoka.workers.dev

- 進捗と次の一手: [PROGRESS.md](PROGRESS.md)
- 要件: [docs/requirements.md](docs/requirements.md)
- 決定記録: [docs/adr/](docs/adr/)
- ローカル開発（サンドボックス）: [docs/local-dev.md](docs/local-dev.md)
- エージェント向け指示: [CLAUDE.md](CLAUDE.md)

## ローカル開発（要約）

`pnpm install`・ビルド・テスト・Claude Code は egress 制限つきコンテナ内で実行する。ホストで `pnpm install` しない。

```bash
./up.sh                       # = op run … docker compose up -d（GitHub token を 1Password から注入）。初回は build に数分
docker compose exec dev zsh   # コンテナへ（workspace = リポジトリ root）
pnpm install && pnpm dev -- --host 0.0.0.0   # → ホストのブラウザで http://localhost:5573/
```

## ライセンス

MIT

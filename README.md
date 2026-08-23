# Mata Tabetai

家族で食べたものを記録し、振り返って次に繋げる web アプリ。

Cloudflare Workers + D1 + R2 でホスティング（単一 Worker で SPA と API を配信）。本番: https://matatabetai.shiraoka.workers.dev

- いま: [docs/status.md](docs/status.md)（SessionStart hook が注入）／ 履歴: [docs/log.md](docs/log.md) ／ 段取り: [docs/roadmap.md](docs/roadmap.md)
- 要件: [docs/requirements.md](docs/requirements.md)
- 決定記録: [docs/adr/](docs/adr/)
- ローカル開発（サンドボックス）: [docs/local-dev.md](docs/local-dev.md)
- エージェント向け指示: [CLAUDE.md](CLAUDE.md)

## ローカル開発（要約）

`pnpm install`・ビルド・テスト・Claude Code は egress 制限つきコンテナ内で実行する。ホストで `pnpm install` しない。

```bash
./up.sh                       # = docker compose up -d（資格情報なし・冪等）。初回は build に数分
./shell.sh                    # コンテナへ（GitHub token 付き。workspace = リポジトリ root）
pnpm install && pnpm dev -- --host 0.0.0.0   # → ホストのブラウザで http://localhost:5573/
```

## ライセンス

MIT

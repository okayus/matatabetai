# Progress

セッションを跨いで現状と次の一手を把握するためのファイル。**作業区切りごとに更新する**こと。

Last updated: 2026-05-11

## 完了済み

- リポジトリ初期化（`main` ブランチ、private GitHub repo に push 済み）
- `okayus-skills` から 4 つのスキルを project スコープでインストール
- CLAUDE.md に製品意図・対象・命名経緯、コーディング思想（DMMF）、開発ワークフローを記録
- ドメイン候補確認: `matatabetai.{app,com,jp,...}` すべて空き（**未取得**）
- main 直 commit/push 防止: Claude Code `PreToolUse` hook で実装（private repo のため branch protection が使えない代替）

## 次のアクション（直近1-2手）

1. **Walking Skeleton を立てる** — `.claude/skills/cloudflare-workers-deploy-skeleton/references/setup-order.md` の手順に沿って、SPA + API + Cron が `main` push → 本番URL で `/health` 200 を返すところまでを最初に通す。
2. ユーザーが対話的にやる必要がある先行作業:
   - `wrangler login`
   - `wrangler d1 create matatabetai`（D1 名は要確認 / 後述）
   - Cloudflare API トークン発行 → GitHub Secrets 登録（`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`）

Walking Skeleton が緑になってから初めてビジネスロジック（投稿モデル、SNS フィード UI）に着手する。

## 未決事項

- **ドメイン取得タイミング** — Walking Skeleton 完成後、Workers のデフォルトURLで動作確認してから `matatabetai.app` を取るか、先取りするか。Cloudflare Registrar で取れば DNS 連携が楽（ただし `.jp` は非対応）。
- **D1 データベース名** — `matatabetai` 単一でいくか、env 別に分けるか。
- **認証方式** — 家族限定なので最小限。WebAuthn（passkey）に振るか、もっと軽い共有パスワード／招待リンクで済ますか。一般公開する場合の拡張余地と合わせて決める。
- **写真ストレージ** — R2 を前提に考えているが、Walking Skeleton 段階では未着手。

## このファイルの運用

- セッション終了時、または大きな区切りで「完了済み」と「次のアクション」を更新
- 「未決事項」は決まったら CLAUDE.md（恒久的な決定）か該当コードへ移して、ここからは削除
- コードを読めばわかる情報（スキル名のリストアップ、ファイル構成）は書かない

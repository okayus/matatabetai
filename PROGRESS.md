# Progress

セッションを跨いで現状と次の一手を把握するためのファイル。**作業区切りごとに更新する**こと。

Last updated: 2026-05-11

## 完了済み

- リポジトリ初期化（`main` ブランチ、private GitHub repo に push 済み）
- `okayus-skills` から 4 つのスキルを project スコープでインストール
- CLAUDE.md に製品意図・対象・命名経緯、認可モデル（スペース）、インフラ方針、コーディング思想（DMMF）、開発ワークフローを記録
- ドメイン候補確認: `matatabetai.{app,com,jp,...}` すべて空き（**未取得**）
- main 直 commit/push 防止: Claude Code `PreToolUse` hook で実装（private repo のため branch protection が使えない代替）
- `wrangler login` 完了
- D1 `matatabetai` 作成完了（database_id: `58a6232f-2847-4f9b-936f-725704d1fb61` / region: APAC）— Walking Skeleton 着手時に wrangler.jsonc に書き込む
- GitHub Secrets: `CLOUDFLARE_ACCOUNT_ID` 設定完了（`b206ff3a1f57cd57469b20adaf8be123`）

## 次のアクション（直近1-2手）

1. **Walking Skeleton を立てる** — `.claude/skills/cloudflare-workers-deploy-skeleton/references/setup-order.md` の手順に沿って、SPA + API（Cron は含めない）が `main` push → 本番URL で `/health` 200 を返すところまでを最初に通す。
2. ユーザーが対話的にやる必要がある先行作業:
   - Cloudflare API トークン発行 → GitHub Secrets `CLOUDFLARE_API_TOKEN` 登録（ブラウザ作業が必要）

Walking Skeleton が緑になってから初めてビジネスロジック（スペース、投稿モデル、SNS フィード UI）に着手する。

## 未決事項

- **ドメイン取得タイミング** — Walking Skeleton 完成後、Workers のデフォルトURLで動作確認してから `matatabetai.app` を取るか、先取りするか。Cloudflare Registrar で取れば DNS 連携が楽（ただし `.jp` は非対応）。
- **認証方式** — スペース＝認可境界 / 招待リンクで参加（1人1スペース作成・複数参加可）はCLAUDE.md に記載済。残るのは「ユーザー本人の認証手段」（WebAuthn passkey か、招待リンクから直に作るマジックリンク方式か等）。一般公開時の拡張余地と合わせて決める。
- **写真ストレージ** — R2 を前提に考えているが、Walking Skeleton 段階では未着手。

## このファイルの運用

- セッション終了時、または大きな区切りで「完了済み」と「次のアクション」を更新
- 「未決事項」は決まったら CLAUDE.md（恒久的な決定）か該当コードへ移して、ここからは削除
- コードを読めばわかる情報（スキル名のリストアップ、ファイル構成）は書かない

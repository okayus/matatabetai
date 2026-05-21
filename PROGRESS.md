# Progress

セッションを跨いで現状と次の一手を把握するためのファイル。**作業区切りごとに更新する**こと。

Last updated: 2026-05-22

## 完了済み

- リポジトリ初期化、`okayus-skills` からスキル install、CLAUDE.md に製品意図・認可モデル・インフラ方針・コーディング思想・開発ワークフローを記録
- ドメイン候補確認: `matatabetai.{app,com,jp,...}` すべて空き（**未取得**）
- main 直 commit/push 防止: Claude Code `PreToolUse` hook で実装
- **Walking Skeleton 本番稼働** — https://matatabetai.toshiaki-mukai-9981.workers.dev で `/health` 200 + SPA 配信。`main` push → GH Actions が D1 migrations → deploy を実行。D1 `matatabetai` 作成済・空 migration `0000_init.sql` 適用済

## 次のアクション（直近1-2手）

1. **スペース・投稿のドメインモデル設計** — CLAUDE.md のコーディング思想（DMMF）に沿って、Branded Type + Discriminated Union + Zod スキーマで最小のスペース/メンバー/投稿のモデルから書く
2. 写真ストレージ（R2）の導入

## 未決事項

- **ドメイン取得タイミング** — Walking Skeleton が workers.dev で稼働中、RP_ID も workers.dev に固定済。custom domain に移行する場合は credential 移行戦略を併せて検討する必要がある（CLAUDE.md インフラ方針 参照）。`matatabetai.app` は引き続き空き。
- **認証方式** — スペース＝認可境界 / 招待リンクで参加はCLAUDE.md に記載済。残るのは「ユーザー本人の認証手段」（WebAuthn passkey か、招待リンクから直のマジックリンクか等）。
- **写真ストレージ** — R2 を前提に考えているが、未着手。

## このファイルの運用

- セッション終了時、または大きな区切りで「完了済み」と「次のアクション」を更新
- 「未決事項」は決まったら CLAUDE.md（恒久的な決定）か該当コードへ移して、ここからは削除
- コードを読めばわかる情報（スキル名のリストアップ、ファイル構成）は書かない

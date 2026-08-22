# ADR-001: プロジェクト始動 — 技術選定・開発形態・skill 先行の方針

- ステータス: 承認
- 日付: 2026-08-22

## コンテキスト

家族で「日々食べたもの」を記録するアプリ matatabetai を始める（要件: [docs/requirements.md](../requirements.md)）。作者には同じ家族規模・同じ Cloudflare スタックの先行プロジェクトが 3 つあり（nyalog = 猫の健康管理、routine-tasks = 家族タスク、mazuoboeru = 公開クイズ SaaS）、そこで確定した設計と運用は okayus-skills に skill として抽出されている。本 ADR は「先行プロジェクトの決定のうち何をそのまま採用するか」と、今回特有の判断をまとめる。

## 決定

### 1. インフラ: Cloudflare Workers + D1 + R2、単一 Worker（nyalog 踏襲）

SPA（React + Vite + `@cloudflare/vite-plugin`）と API（Hono）を 1 Worker で配信。ORM は Drizzle、検証は Zod、エラーは neverthrow の Result。node 24 を host / sandbox / CI で統一。骨格は skill `cloudflare-workers-deploy-skeleton`、デプロイは Workers Builds（キーレス、skill `cloudflare-workers-builds-keyless-deploy`）。

### 2. 認証: passkey 限定の招待制（nyalog ADR-003 踏襲）

利用者は家族数人で、Google OAuth はプロジェクトごとのコンソール作業が要り、GitHub OAuth は家族が持っていない。passkey はログインがロック解除と同じ操作で済み、招待制と相性がよい。RP_ID は本番ホスト名に不可逆に固定される — **passkey を 1 つでも登録する前に本番 URL を確定する**。skill `cloudflare-workers-passkey-auth`。

### 3. 認可: per-space membership + 招待リンクを初日から（nyalog ADR-005 / routine-tasks ADR-0001 踏襲）

nyalog は「家族 = 暗黙の 1 テナント」から per-space へ後付けで移行し、4 PR と D1 の CASCADE 事故（子行 1257 件消失 → backup 復旧）を払った。matatabetai は最初の migration から `spaces` / `space_members` / `invites` を持ち、ドメイン表の親は `space_id NOT NULL`。招待は single-use トークン（sha256 保存）をリンクで渡す。所属外は 404。skill `cloudflare-workers-space-membership-invite`。

### 4. 写真: private R2 + Worker proxy 配信（nyalog ADR-006 踏襲）

家族の食卓写真は private。public bucket / `r2.dev` / 公開オリジン前提の画像変換は使わない。クライアントで 1600px JPEG に縮小してから上げる（EXIF/GPS が落ち、無料枠 10 GB-month が長く持つ）。サムネイルはクライアントが 2 枚目を作る方式を既定とし、Images binding は必要になったら。skill `cloudflare-r2-private-image-upload`。

### 5. 開発形態: サンドボックス + credential-free パイプライン（nyalog ADR-008 踏襲）

開発は egress 制限つき Docker コンテナ内（skill `claude-code-docker-sandbox`）。コンテナに credential は置かず、push / PR / merge はホストの systemd リレー（skill `sandboxed-agent-git-relay`、GitHub App `matatabetai-relay`）が `claude/*` ブランチを代行する。main は ruleset で PR 必須 + `ci` check 必須 + bypass なし。リポジトリは public（ruleset の強制と、サンドボックスからの未認証 CI 参照のため）。

### 6. skill 先行と還元ループ（今回特有）

本プロジェクトは上記 2〜4 の skill の**最初の利用者**であり、これらは本番実績の前に書かれている。各 SKILL.md の `UNVERIFIED:` 項目を実装中に確認・訂正し、その場で skill を更新する（okayus-skills を rw でマウント、commit はホスト）。skill に還元できる知見はこのリポジトリの docs ではなく skill に書く。

### 7. 集計の単位は料理名（プロダクト判断）

同じ料理でも冷蔵庫の中身で食材が変わるため、集計は `meals.name`（NFKC 正規化）で行い、食材タグは検索・絞り込みの軸に留める。

## 影響

- 先行プロジェクトの設計をそのまま使うため、初期実装の判断コストが小さい。その代わり skill の UNVERIFIED 項目の検証が実装作業に含まれる
- RP_ID 固定のため、本番 URL（`matatabetai.<subdomain>.workers.dev` または custom domain）を passkey 登録前に決める必要がある
- R2 には PITR が無い。写真のバックアップ方針は写真機能の実装時に別 ADR で決める（既定案: 端末に原本が残るので受容）

## 却下した選択肢

- Cloudflare Access / OAuth による認証 — nyalog ADR-002→003、mazuoboeru ADR-0001 追記の理由で却下
- 家族 = 1 テナント固定のデータモデル — 後付け移行のコストを既に払った経験から却下
- Cloudflare Images（stored）— 家族規模に対して固定費が過剰
- ホストでの直接開発 — サプライチェーン対策上却下（全プロジェクト共通）

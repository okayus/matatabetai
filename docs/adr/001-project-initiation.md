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

## 改訂（2026-08-23）: push / PR 経路を host relay から「1 リポ限定 PAT を 1Password で注入」へ

§5 の「ホストの systemd リレー（GitHub App）が `claude/*` を代行する」を撤回し、okayus-skills `sandboxed-agent-github-token-via-1password`（mazuoboeru・kokemusu で 2026-08-22 に E2E 済み）を採用する。

- **仕組み**（→ **2026-08-23 改訂で注入点を変更**、下記。以下は当時の記録）: `./up.sh` = `op run --env-file=.docker/sandbox.env -- docker compose up -d`。matatabetai 1 リポだけに届く GitHub fine-grained PAT（Contents + Pull requests、Workflows なし、90 日）を 1Password から解決してコンテナの env にだけ注入する。git の credential helper は env を echo する inline 関数、`gh` は `GH_TOKEN` を直接読む。ディスクには何も残らず、`op run` を通さない起動は token なし（fail closed）
- **理由**: relay は credential を境界の外に置ける代わりに、プロジェクトごとの GitHub App・秘密鍵・systemd timer・`Relay-Merge` トレーラーという可動部を持つ。家族用の solo プロジェクトではこの重さが見合わない。agent が `gh pr create` / `gh pr checks` を直接使えるのも利点
- **失うもの**: compromised sandbox が「CI green の PR を merge できる」「非保護ブランチへ push できる」残余リスク。許容できなくなったら relay に戻す（skill の migration 手順）
- **このリポ固有の注意**: **private リポは Free プランでは ruleset / branch protection が効かない**。token 経路の本来の境界（ruleset + token scope）のうち ruleset 側が無く、main を守るのは hook と Claude Code の deny（force push / `main` / `gh pr merge` / `gh api`）だけになる。public 化（nyalog / mazuoboeru / kokemusu と同じ）すれば `protect-main` ruleset（PR 必須 + `ci` check + bypass なし）が効く — `docs/roadmap.md` 決めること 3
- **merge ポリシー**: 人間がホストで merge（既定）。agent に依頼させるなら `gh pr merge --auto --squash` のみ allow + repo の auto-merge を有効化
- relay 用に置いた `~/.config/matatabetai-relay/` と systemd units は撤去済み（GitHub App は未作成だったので戻し道は不要）

## 改訂（2026-08-23）: token の注入点を「コンテナ env」から「exec 時のシェル」へ

方針（1 リポ限定・期限付きの credential を境界の内側に置く）は変えない。**入れ方だけを変える。** kokemusu で同じ配線を 1 日運用して出た 2 つの事実による（okayus-skills `sandboxed-agent-github-token-via-1password` 0.2.0 / v0.8.0）。本リポはまだ token E2E 前なので、踏む前に配線を直しておく。

- **やめた理由 1 — `docker compose up` が破壊的になる**: token が compose の `environment:` にあると、それは**コンテナ設定の一部**。op を通さない `docker compose up -d` が 1 回来ただけで「設定変更」と判定され、compose が[コンテナを停止して作り直す](https://docs.docker.com/reference/cli/docker/compose/up/)。token は消え、中で動いていた Claude のセッションも落ちる。
- **やめた理由 2 — 「compose は未解決の値なしキーを除去する」は誤り**: 実測（Compose v5.3.1 / Engine 29.6.2）では host 側が unset のとき `Config.Env` に **`=` を持たない裸の `GH_TOKEN`** が残る。コンテナ側は unset なので fail closed 自体は成立するが、`docker inspect … | cut -d= -f1 | grep -c` が「注入済み」と誤答する。確認は `grep -c '^GH_TOKEN=.'`（`=` の後に 1 文字以上）。
- **新しい注入点**: `./up.sh` = 素の `docker compose up -d`（**資格情報ゼロ・冪等**）。token は **`./shell.sh`**（= `op run --env-file=.docker/sandbox.env -- docker exec -it -e GH_TOKEN matatabetai-dev …`）が開いたシェルとその子（claude / git / gh）にだけ入る。`docker exec -e NAME`（値なし）はホストプロセスの env から転送し、未設定なら何も渡さない＝ fail closed のまま。値は argv に載らないので `ps` に出ない。
- **境界・merge 方針・token scope は無変更**。§ 「このリポ固有の注意」（private リポでは ruleset が効かない）も無変更 — 2026-08-23 に public 化済みなので `protect-main` ruleset が本来の境界として効く。
- **副作用**: シェルを開くたびに 1Password のアンロックが要る。エージェントは自分では token 付きシェルを開けない（`op` のセッションが無い）＝意図的な人間のチェックポイント。
- **rotation**: `op item edit` のあと **新しい `./shell.sh` を開くだけ**。`docker exec` は作成時 env を継承し reconcile しないので、旧方式では re-exec しても新 token は入らずコンテナ再作成が要った。
- **戻し方**: `docker-compose.yml` の `environment:` に `GH_TOKEN: "${GH_TOKEN:-}"` を戻し、`up.sh` を `op run … -- docker compose up -d` に戻す。そのとき起動チェックは 3 値（`present (len=N)` / `is empty` / `is unset`）にすること。

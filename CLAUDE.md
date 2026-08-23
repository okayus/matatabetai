# Mata Tabetai (またたべたい)

このファイルは**規約と目次だけ**（コンテナ内も含めどのセッションでも最初に読まれる）。進捗と次の一手は `docs/status.md`（SessionStart hook が自動注入）、履歴は `docs/log.md` と git、段取りは `docs/roadmap.md`、要件の正典は `docs/requirements.md`、決定は `docs/adr/`。**ここに進捗・履歴・完了報告を書かない。**

## 進捗の持ち方（status hub）

- `docs/status.md` = いまのハブ。**40 行 / 3 KB 上限**、見出しは「フェーズ / 次の 3 手 / 詰まり・人手待ち / 進行中 PR」の 4 つ固定。終わった項目は消して `docs/log.md` の先頭へ 1 行（取り消し線は禁止）。8 行を超える節は `docs/plans/<topic>.md` に切り出し、完了したら削除。
- セッションの区切りでユーザが `/handoff` を打つ（書き換え → log → `.claude/hooks/check-status.sh` → commit）。CI も同じ検査を走らせる。
- `/compact` するときは、変更したファイル一覧と「次の 3 手」の 1 手目を必ず要約に残す。

## このアプリは何のためにあるか

食べたものを記録するアプリだが、**目的は記録そのものではない**。

1. **振り返って思い出を楽しむ** — 過去の食事を眺めることが喜びになる UX を優先
2. **次に食べるもののアイディアにつなげる** — 「またたべたい」が次の献立決定の起点になる

機能設計・コピーライティング・UI の判断に迷ったら、この 2 つに寄与するかで決める。「記録の正確性」「網羅性」「カロリー計算」のような汎用食事記録アプリの方向には進まない。

## 想定ユーザー

- 第一義的には**家族数人だけ**が使う閉じた SNS
- ただし**将来一般公開する可能性を残している**ため、bot scan / レート制限 / 認証などインフラ側は最初から公開を前提に設計する
- UX は「身内で笑い合える内輪感」を許容してよい（インスタ風だが対外的な見栄えは二の次）

## 認可モデル

家族単位の「**スペース**」が認可境界（[ADR-001](./docs/adr/001-project-initiation.md)、skill `cloudflare-workers-space-membership-invite`）。

- 各ユーザーは自分のスペースを **1 つだけ作成できる**（owner。初回登録時に atomic に作成）
- 招待リンク（URL）経由で他人のスペースに **参加できる（参加先は複数可、role = member）**。招待は single-use トークン、DB には sha256 のみ保存
- ユーザーは自分が作成 or 参加しているスペースのリソースのみアクセス可。`sessionMiddleware` が毎リクエスト `c.var.userId` と `c.var.memberSpaceIds` を解決し、`/api/spaces/:spaceId/*` は `spaceMiddleware` で所属を確認する
- **所属外は 404**（403 は存在が漏れる）。`created_by` は表示・監査用であって認可軸ではない
- ドメイン表の親（`meals`）は `space_id NOT NULL`、子（`meal_photos` / `meal_tags`）は親経由で属する。投稿・写真・「またたべたい」などすべてのリソースは必ずいずれかのスペースに属する。この境界は将来の一般公開後も維持する

## 認証

**passkey（WebAuthn）限定の招待制**（skill `cloudflare-workers-passkey-auth`、nyalog ADR-003 踏襲）。パスワード・OAuth・Cloudflare Access は使わない。登録経路は「初回 owner（`INITIAL_REGISTRATION_TOKEN`）」「招待リンク」「ログイン済みユーザの端末追加」の 3 つだけ。

## インフラ方針

Cloudflare Workers 上で SPA + API を単一 Worker から提供する（Hono / React + Vite + `@cloudflare/vite-plugin` / Drizzle + D1 / R2 / Zod / neverthrow / pnpm / TypeScript strict）。

**使わない:**

- **Cron Triggers** — 定期実行を要する機能は当面持たない

**D1 命名:**

- 本番 DB は `matatabetai` 単一でスタート（作成済み）。staging/preview が必要になった時点で `matatabetai-staging` を追加する（命名の非対称性は許容）

**写真（R2）:**

- private bucket `matatabetai-photos` + Worker proxy 配信（skill `cloudflare-r2-private-image-upload`）。public bucket / `r2.dev` / 公開オリジン前提の画像変換は使わない。クライアントで縮小してから上げる

**RP_ID / ORIGIN:**

- 本番 Worker ホスト `matatabetai.shiraoka.workers.dev` に**固定済**（2026-06 の account subdomain 改名 `toshiaki-mukai-9981` → `shiraoka` に追従、passkey 未登録のうちに更新）。WebAuthn の credential 不変性ルールに従い、**passkey を 1 つでも登録した後のホスト変更は破壊的**（既存 credential が全て無効化）
- custom domain に移行するなら **passkey 登録前**に済ませる。後からの移行は credential 移行戦略（既存 credential 諦め or 並行運用）を別途検討する
- ローカル開発は `packages/web/.dev.vars` 側で `RP_ID=localhost` / `ORIGIN=http://localhost:5173` に上書きする

**デプロイ:**

- Workers Builds（キーレス、skill `cloudflare-workers-builds-keyless-deploy` 0.3.0）へ移行する — 接続の儀式は人手（`docs/plans/host-setup.md`）。それまでは GH Actions `deploy.yml`（`CLOUDFLARE_API_TOKEN` secret）で `main` push → D1 migrations → deploy。CI（`.github/workflows/ci.yml`、secrets なし、job `ci`）は deploy と独立で、PR と `main` push で typecheck / build と status hub の上限検査を走らせる

## 命名

「Mata Tabetai（またたべたい）」— 由来と却下した候補は [docs/naming.md](./docs/naming.md)。「お気に入り」は UI 上「またたべたい」と呼ぶ。

## 開発ワークフロー

### 開発環境の前提（ADR-001）

開発は **egress 制限つき Docker サンドボックス内**で行う（[docs/local-dev.md](./docs/local-dev.md)、skill `claude-code-docker-sandbox`）。起動は **`./up.sh`**（= 素の `docker compose up -d`。資格情報ゼロ・冪等）、**token 付きシェルは `./shell.sh`**（= `op read で op:// 参照を解決 → docker exec -e GH_TOKEN matatabetai-dev …`）。credential は **matatabetai 1 リポ限定の GitHub fine-grained PAT**（Contents + Pull requests、Workflows なし、90 日）だけで、`./shell.sh` が開いたシェルの env にのみ存在し、ディスクにもコンテナ設定にも書かない（skill `sandboxed-agent-github-token-via-1password` 0.2.0、ADR-001 改訂 2026-08-23）。Cloudflare のトークンは持たず `wrangler login` もしない。merge は人間がホストで行う。

- ホストで `pnpm` / `npx` / `wrangler` などを直接叩かない（`.claude/hooks/require-container.py` が止める）。`docker compose exec dev <cmd>` 経由で実行する
- PR / CI の状態は **`gh pr view` / `gh pr checks`**（fine-grained PAT は Checks REST API を呼べないので `gh api …/check-runs` は使わない。`gh api` は deny）
- merge 後の deploy 完了は `gh run list` / `gh run view` と本番 `/health`（`https://matatabetai.shiraoka.workers.dev/health`）で確認する

### ブランチ戦略

`main` への直接 commit/push は hook（`.claude/hooks/block-main-commit.sh`）と `.claude/settings.json` の deny で禁止。すべての変更は PR 経由で squash merge する。**リポジトリが private の間、GitHub 側の ruleset は効かない（Free プラン）** — main を守っているのは hook と deny だけなので、public 化（`docs/roadmap.md` 決めること 3）までは特に慎重に。

**サンドボックス内エージェント**（コンテナ内 claude）の作業フロー:

1. **ブランチ作成**: `git switch -c claude/<type>-<short-description>`
2. **実装と commit**: 小さく積む。`.github/workflows/**` は変更しない（token に `workflows` 権限が無く push が拒否される。人間がホストで行う）
3. **push と PR**: `git push -u origin claude/<branch>` → `gh pr create --fill`（計画・確認内容を本文に）→ **PR の URL を報告する**
4. **CI 確認**: `gh pr checks --watch`。red なら直して commit を積む
5. **merge はしない**: 人間がホストでレビューして squash merge する（`gh pr merge` / `gh api` は deny）。migration（`drizzle/` の変更）を含む PR は merge が本番 D1 への適用まで直結するので、PR 本文に backup 手順を書く（skill `cloudflare-d1-drizzle-migration`）
6. **進捗の書き戻し**: セッションの区切りでユーザが `/handoff` を打つ（`docs/status.md` を書き換え → `docs/log.md` → 上限検査 → commit）。PR の途中で `docs/status.md` を触るなら上限（40 行 / 3 KB、見出し 4 つ）を守る — CI が検査する
7. **token の扱い**: `GH_TOKEN` はこのプロジェクトの repo-scoped token。表示しない、`gh auth login` しない、URL に埋めない。`git push` が `401` を返したら `./shell.sh` 以外で開いたシェルにいる＝ token 無し。**回避しようとせず人間に `./shell.sh` を開いてもらう**（`op` のセッションはエージェントには無い）。PR 本文の修正は `gh pr comment` で（`gh pr edit` は image の古い `gh` が Projects classic の GraphQL エラーで落ちる）。**コンテナ内から `docker compose up` は打たない**

**ホストでの作業**（人間）: `git switch -c <type>/<short-description>` → 実装 → PR → squash merge → `git fetch --prune`（merge 後のリモートブランチは `delete_branch_on_merge` で消える）。

### ブランチ命名規則

- `claude/<type>-<desc>` — サンドボックス内エージェントの作業（settings の allow は `git push origin claude/*` のみ）
- `feat/` / `fix/` / `refactor/` / `chore/` / `docs/` — ホストでの作業

### コミットメッセージ

[Conventional Commits](https://www.conventionalcommits.org/) に従う: `<type>: <description>`（type: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`）。説明は日本語で可。

### Agent skills

- **okayus-skills**（`../okayus-skills`。この status hub の出典 `agent-status-hub`、sandbox / token / docs / Cloudflare 各 skill）は `docker-compose.override.yml` で `~/.claude/skills` に **読み書き可**でマウントされる（ホストのセッションは user scope の copy を見る — 古い可能性があるので `gh skill update` を挟む）。**このリポジトリに okayus-skills を vendoring しない**（2026-05 の project-scope copy は古くなったので削除済み）
- このプロジェクトは `cloudflare-workers-passkey-auth` / `cloudflare-workers-space-membership-invite` / `cloudflare-r2-private-image-upload` の**最初の利用者**で、各 SKILL.md の `## Unverified claims — confirm while implementing, then write back` 節が還元チェックリスト
  - **還元のルール**: 実装中に `UNVERIFIED:` 項目を確認・訂正したら、**その場で** `~/.claude/skills/<skill>/SKILL.md`（= ホストの okayus-skills）を直し、`(verified YYYY-MM-DD in matatabetai)` を添えて `metadata.version` を上げる。commit / PR はホスト側で `cd ../okayus-skills` して行う（`feat(<skill>): … を還元`）。このリポジトリの PR とは別
  - 新しい罠を踏んだら同じ skill の pitfalls に追記する。skill に無い新しい話題（例: OGP 取得）は新 skill 候補として `docs/roadmap.md` に書く
- **third-party skill** は `.claude/skills/` に実体を vendoring する（symlink にしない）。コンテナ内で `npx skills add <owner>/<repo>@<skill> -a claude-code -y`。`skills-lock.json` を commit、更新は単独 PR
- **公式ドキュメントの調べ方（3 層。事前学習の記憶で API を断定しない）**: ① `context7` MCP（`resolve-library-id` → `query-docs`。MDN / Hono / Drizzle / React / Vite / Cloudflare Workers を横断）— Cloudflare は `cloudflare-docs` MCP を最優先 ② `llms.txt` の直読み（WebFetch: `hono.dev/llms.txt` `orm.drizzle.team/llms.txt` `react.dev/llms.txt` `vite.dev/llms.txt` `vitest.dev/llms.txt` `zod.dev/llms.txt` `developers.cloudflare.com/llms.txt`。目次 → 必要ページ。`llms-full.txt` は巨大なので最後） ③ WebSearch → WebFetch（WebSearch は Anthropic 側で実行され egress 不要。URL が firewall の allowlist 外なら取得できないので ① に戻る）
- **HTML / CSS / UI を書く前に `modern-web-guidance` を読む**（project scope `.claude/skills/modern-web-guidance/` に同梱。`search` / `retrieve` は `npx -y modern-web-guidance@latest …` を実行する）

### 段取り

段取りとフェーズは [docs/roadmap.md](./docs/roadmap.md)、いまの 3 手は `docs/status.md`（自動注入）、人手で済ませる準備は `docs/plans/host-setup.md`。`.github/workflows/**` の変更は人間がホストから push する（token に `workflows` 権限なし）。

## コーディング思想

**Domain Modelling Made Functional** の原則に従う。

### 核心原則

- **型で不正な状態を表現不可能にする** — ドメインの制約を型システムで強制し、不正なデータがコンパイル時に排除されるようにする
- **代数的データ型でドメインをモデリングする** — Discriminated Union で状態・バリエーションを表現し、パターンマッチで網羅性を保証する
- **純粋関数でドメインロジックを書く** — 副作用（DB, API, IO）は境界に押し出し、ドメインロジックは入力→出力の純粋な変換として実装する
- **Result 型でエラーを型安全に扱う** — `neverthrow` の `Result`/`ResultAsync` を使い、例外を throw しない。エラーも戻り値の型の一部として表現する
- **Zod スキーマでドメイン制約を表現する** — バリデーションをスキーマとして宣言し、Branded Type で「検証済み」を型レベルで保証する
- **Branded Type には `unique symbol` を使う** — `{ readonly __brand: unique symbol }` で定義する。文字列リテラルではなく `unique symbol` を使うことで、異なる Branded Type 間の誤った代入をコンパイル時に防ぐ

### 実装パターン

```typescript
// Branded Type で検証済みの値を区別
type MealId = string & { readonly __brand: unique symbol };
const MealId = z.string().uuid().brand<"MealId">();

// レシピの出所は URL / 自由テキスト / なし のいずれか → Discriminated Union で表現
type RecipeSource =
  | { type: "url"; url: string }
  | { type: "text"; text: string }
  | { type: "none" };

// ドメインロジックは純粋関数 + Result 型
function createMealRecord(input: unknown): Result<MealRecord, ValidationError> {
  // ...
}

// 副作用は境界（リポジトリ / ハンドラ）に閉じ込める
```

### ドメインの設計メモ

集計単位・タグ・サジェスト・URL / レシピ・またたべたい・日本語検索の決まりは [docs/requirements.md](./docs/requirements.md) 「実装への設計メモ」。

### やらないこと

- `throw` によるエラー伝播（Result 型を使う）
- `any` 型の使用
- 過度な抽象化・汎用化（現在の要件に必要な最小限の複雑さに留める）
- 不要なコメント・ドキュメント（型と関数名で意図を伝える）

### フロントエンド

家族数人がスマホで使う。Baseline Newly available まで採用してよいが polyfill と重い fallback は入れない。`vercel-react-best-practices`（okayus-skills 経由）と `modern-web-guidance`（同梱済み）を引く。

## テスト方針

**ユニットテストと e2e は別レイヤーの別責務**。混ぜない。

### ユニットテスト — ドメインの _意味_ を表現する

- 対象: 純粋関数、Discriminated Union のパターンマッチ、Zod スキーマ、Result を返すドメイン関数
- 問い: 「この値は何を意味するか」「この関数の契約は何か」
- 型で表現しきれない意味的制約（例: 「レシピ source が `url` のとき必ず有効な URL」）を固定する
- IO・HTTP・DB は一切持ち込まない。副作用は境界の外側なので、ここで検証しても意味を表さない
- 型で既に保証されていること（`MealId` に string を渡すとコンパイルエラー、等）はテストにしない。型がテストの代替

### e2e テスト — 配線と _存在の事実_ を表現する

- 対象: `wrangler dev` 相手に実ブラウザで通すユーザーシナリオ 1〜数本と、型で保証できない境界（skill `cloudflare-workers-e2e-playwright`）
- 問い: 「型で保証できないものが、実際に繋がって動いているか」
- 守る範囲（意図的に狭く）:
  - **クリティカルパス 1 本**: ログイン → 投稿作成（写真+メタ） → またたべたいトグル → 削除 → ログアウト
  - **永続化の事実**: リロード後に投稿・写真が残る（ユニットでは原理的に検知不能）
  - **認可の横流れ**: 他スペースのリソースに触れない（API 404 + UI のアクセス拒否表示）
  - **セキュリティヘッダ**: CSP / HSTS / X-Frame-Options の付与（ミドルウェア配線の回帰防止）
- 入れない: ドメインの意味（ユニットに譲る）、見た目のアニメーション挙動、網羅的な入力バリデーション（ユニットと Zod で押さえる）
- `pnpm test:e2e` はローカル dev データを消す前提で書く（global-setup で dev-bypass ユーザのデータを全削除）

### 棲み分けの原則

- ユニットが "means"、e2e が "exists and is wired"。ユニットが増えても e2e は増えない
- e2e でドメインの網羅を目指さない。1 本のスモークと、型で絶対に検知できない数点だけを持つ
- ユニットで IO をモックしない。モックが必要な時点でそれは e2e の領域

## コマンド

```bash
# すべてコンテナ内（docker compose exec dev zsh）で実行する
pnpm dev -- --host 0.0.0.0   # 開発サーバー → ホストから http://localhost:5573/
pnpm build                   # プロダクションビルド
pnpm check                   # pnpm types + type check（format / lint は未導入）
pnpm types                   # wrangler.jsonc から worker-configuration.d.ts を生成（gitignore。clone 直後に 1 回）
pnpm db:migrate              # D1 migration をローカルに適用
pnpm db:migrate:prod         # 本番 D1 に適用（ホスト・要 wrangler login。通常は deploy パイプラインが行う）
```

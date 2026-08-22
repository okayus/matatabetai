# Mata Tabetai (またたべたい)

> **最初に [PROGRESS.md](./PROGRESS.md) を読むこと**。現在の進捗・次のアクション・未決事項はそこに記録されている。本ファイルは恒久的な意図のみを記述する。要件の正典は [docs/requirements.md](./docs/requirements.md)、根幹の決定は [docs/adr/](./docs/adr/)。

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

- 現状は GH Actions `deploy.yml`（`CLOUDFLARE_API_TOKEN` secret）で `main` push → D1 migrations → deploy。Workers Builds（キーレス、skill `cloudflare-workers-builds-keyless-deploy`）への移行は PROGRESS.md の未決事項

## 命名の経緯

候補から「Mata Tabetai」を選んだ理由：

- 「また食べたい」は美味しかった食事に対して家族が実際に口にする自然な日本語で、**アプリの目的（振り返り→次へ）を 1 フレーズで内包する**
- 「お気に入り」機能は UI 上「またたべたい」と呼ぶ予定。データモデルの favorite カラムよりこの呼称が UX 上の主役

却下した類似名と理由：

- **Tabeta** — 食品ロスアプリ「TABETE」と 1 文字違いで一般公開時の混同リスク大、「TABETA?」アプリが既存
- **Tabelog** — 食べログがある

## 開発ワークフロー

### 開発環境の前提（ADR-001）

開発は **egress 制限つき Docker サンドボックス内**で行う（[docs/local-dev.md](./docs/local-dev.md)、skill `claude-code-docker-sandbox`）。コンテナには credential が一切無い: `git push` は deny かつ不可能、`gh` は未認証で動かない、`wrangler login` はしない。push / PR / merge はホスト側リレーか人間が担う。

- ホストで `pnpm` / `npx` / `wrangler` などを直接叩かない（`.claude/hooks/require-container.py` が止める）。`docker compose exec dev <cmd>` 経由で実行する
- PR / CI の状態確認は **`scripts/ci-status.sh`**（`--watch` で決着まで待つ）。**追いコミット後は branch でなく sha で引く**（リレーが push する前の古い sha の結果を掴む事故を防ぐ — スクリプトは HEAD の sha 固定）。リポジトリが private の間は未認証 REST が 404 を返すので、ホストで `GH_TOKEN=$(gh auth token)` を付けて実行する
- merge 後の deploy 完了は GH Actions の run（ホストで `gh run list`）で確認する

### ブランチ戦略

`main` への直接 commit/push は hook（`.claude/hooks/block-main-commit.sh`）で禁止。すべての変更は PR 経由で squash merge する。

**サンドボックス内エージェント**（コンテナ内 claude）の作業フロー:

1. **ブランチ作成**: `git switch -c claude/<type>-<short-description>`。`claude/*` 以外はリレーが push を拒否する
2. **実装と commit**: commit までがエージェントの仕事。push はしない — ホスト側リレー（systemd timer, 60 秒間隔）が自動 push し、PR を作成する。**リレーが未稼働の間は人間がホストで push / PR する**（PROGRESS.md の手順で有効化）
3. **CI 確認**: `scripts/ci-status.sh --watch`。red なら直して commit を積む
4. **マージ**: 確信のある完成した変更のみ、最終 commit メッセージ末尾に `Relay-Merge: yes` トレーラーを付けると CI green 後にリレーが squash merge する。迷う変更・影響の大きい変更には付けない。**migration（`drizzle/` の変更）を含む PR には絶対に付けない** — merge は本番 D1 への migration 適用まで直結する（nyalog の D1 CASCADE 事故: skill `cloudflare-d1-drizzle-migration`）
   - push 済みの後からマージを頼む時は amend せず空 commit でトレーラーを出す（リレーは exact refspec のみ push、force しない）
5. **PROGRESS 更新**: 大きな節目（機能完成、フェーズ移行、後回し判断）で [PROGRESS.md](./PROGRESS.md) を併せて更新する。PR の一部に含めて良い

**ホストでの作業**（人間）: `git switch -c <type>/<short-description>` → 空コミット → 計画を本文に書いた Draft PR → 実装 → squash merge。

### ブランチ命名規則

- `claude/<type>-<desc>` — サンドボックス内エージェントの作業（リレーが push/PR を代行する唯一の prefix）
- `feat/` / `fix/` / `refactor/` / `chore/` / `docs/` — ホストでの作業

### コミットメッセージ

[Conventional Commits](https://www.conventionalcommits.org/) に従う: `<type>: <description>`（type: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`）。説明は日本語で可。

### Agent skills

- **okayus-skills**（`../okayus-skills`）は `docker-compose.override.yml` で `~/.claude/skills` に **読み書き可**でマウントされる（ホストのセッションは user scope の copy を見る — 古い可能性があるので `gh skill update` を挟む）。**このリポジトリに okayus-skills を vendoring しない**（2026-05 の project-scope copy は古くなったので削除済み）
- このプロジェクトは `cloudflare-workers-passkey-auth` / `cloudflare-workers-space-membership-invite` / `cloudflare-r2-private-image-upload` の**最初の利用者**で、各 SKILL.md の `## Unverified claims — confirm while implementing, then write back` 節が還元チェックリスト
  - **還元のルール**: 実装中に `UNVERIFIED:` 項目を確認・訂正したら、**その場で** `~/.claude/skills/<skill>/SKILL.md`（= ホストの okayus-skills）を直し、`(verified YYYY-MM-DD in matatabetai)` を添えて `metadata.version` を上げる。commit / PR はホスト側で `cd ../okayus-skills` して行う（`feat(<skill>): … を還元`）。このリポジトリの PR とは別
  - 新しい罠を踏んだら同じ skill の pitfalls に追記する。skill に無い新しい話題（例: OGP 取得）は新 skill 候補として PROGRESS.md に書く
- **third-party skill** は `.claude/skills/` に実体を vendoring する（symlink にしない）。コンテナ内で `docker compose exec dev npx -y skills@latest add <owner>/<repo> -y -s <skill> --copy`。`skills-lock.json` を commit、更新は単独 PR

### 次の実装セッションの段取り

1. **ツールチェーン更新 + CI**（chore PR）: wrangler 3 → 4、`@cloudflare/vite-plugin` 0.1 → 1.x、pnpm 9 → 10、node 22 → 24、`@cloudflare/workers-types` → `wrangler types`（skill `cloudflare-workers-deploy-skeleton` の現行基準）。`.github/workflows/ci.yml`（job 名 `ci`: `pnpm check` + unit test）を追加
2. `cloudflare-workers-passkey-auth` + `cloudflare-workers-space-membership-invite` — 認証・スペース・招待
3. ドメイン: meals / tags / meal_tags / またたべたい（[docs/requirements.md](./docs/requirements.md) の設計メモ）
4. `cloudflare-r2-private-image-upload` — 写真（要: ホストで `wrangler r2 bucket create matatabetai-photos`、deploy token に `Workers R2 Storage: Edit`）
5. `cloudflare-workers-e2e-playwright` + `playwright-e2e-in-docker-sandbox` — 3 spec
6. 公開前: `cloudflare-workers-bot-scan-defense`、`cloudflare-d1-weekly-backup-via-pr`

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

### ドメインの設計メモ（要件から決まっていること）

- **集計は料理名**（`meals.name`）で `GROUP BY`。同じ料理でも冷蔵庫の中身で食材が変わるため、食材ではなく名前が集計単位。保存時に NFKC 正規化 + trim した `name_normalized` を持ち、表記ゆれを減らす
- **食材はタグ**（`tags` / `meal_tags` の多対多、スペース単位で一意）。タグ検索は `?tags=a&tags=b` の AND
- **サジェスト**: 投稿画面で直近の料理名を `DISTINCT` で出し、タグで絞り込める。選ぶと前回の URL / レシピ / タグを複製して編集できる
- **URL** は 1 本（レシピ／外食の店／購入した商品）、**自作レシピ**は本文 — `RecipeSource` の Discriminated Union
- **またたべたい** は投稿に対するトグル（favorite）。UI 上の主役なので一覧・集計で前に出す
- **日本語の部分一致検索**は当面 `LIKE '%…%'`（家族規模）。D1 の FTS5 は使えるが日本語には trigram tokenizer が要り、D1 での可否は要確認

### やらないこと

- `throw` によるエラー伝播（Result 型を使う）
- `any` 型の使用
- 過度な抽象化・汎用化（現在の要件に必要な最小限の複雑さに留める）
- 不要なコメント・ドキュメント（型と関数名で意図を伝える）

### フロントエンド

家族数人がスマホで使う。Baseline Newly available まで採用してよいが polyfill と重い fallback は入れない。`vercel-react-best-practices`（okayus-skills 経由）と、導入後は `modern-web-guidance` を引く。

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
pnpm check                   # type check（ツールチェーン更新後は format / lint も）
pnpm db:migrate              # D1 migration をローカルに適用
pnpm db:migrate:prod         # 本番 D1 に適用（ホスト・要 wrangler login。通常は deploy.yml が行う）
```

# Mata Tabetai（またたべたい）

家族で食べたものを記録し、振り返って次の献立につなげる Web アプリ。要件の正典は `docs/requirements.md`（変えるときは先にここを直す）、決定は `docs/adr/`、段取りは `docs/roadmap.md`、開発環境は `docs/local-dev.md`。

## 進捗の持ち方

- 進捗と次の一手は `docs/status.md`（SessionStart hook が毎回注入する）、履歴は `docs/log.md` と git。このファイルには規約だけを書く。
- `status.md` は 40 行 / 3 KB 以内、見出しは「フェーズ / 次の 3 手 / 詰まり・人手待ち / 進行中 PR」の 4 つで固定。終わった項目は消して `log.md` の先頭へ 1 行で移す（取り消し線は使わない）。8 行を超える節は `docs/plans/<topic>.md` に切り出す。書き戻しはユーザが打つ `/handoff`、上限の検査は `.claude/hooks/check-status.sh`（CI も走らせる）。

## このアプリは何のためにあるか

- 目的は記録そのものではなく、過去の食事を振り返って楽しむことと、「またたべたい」を次の献立の起点にすることの 2 つ。機能・文言・UI に迷ったら、この 2 つに寄与するかで決める。記録の正確さ・網羅性・カロリー計算のような汎用の食事記録アプリの方向には進まない。
- 家族数人だけが使う閉じた SNS。UX はインスタ風だが、身内の内輪感を許してよく、対外的な見栄えは二の次。将来の一般公開に備えて、認証・認可・bot scan 対策・レート制限は公開を前提に作る。
- 「お気に入り」は UI では「またたべたい」と呼ぶ。

## 確定済みの決定（根拠は ADR）

- 認可の境界は家族単位の「スペース」で、一般公開の後も変えない。リソースは必ずいずれかのスペースに属する（親の `meals` は `space_id NOT NULL`、子は親を通して属する）。`/api/spaces/:spaceId/*` は `spaceMiddleware` で所属を確かめ、所属外には 404 を返す（403 は存在を漏らす）。`created_by` は表示と監査のためのもので、認可に使わない（ADR-001 §3、ADR-002）。
- 認証は passkey だけの招待制で、パスワード・OAuth・Cloudflare Access は使わない（ADR-001 §2）。登録の経路は、初回の owner（`INITIAL_REGISTRATION_TOKEN`）、招待リンク、ログイン中の端末追加の 3 つだけ。
- 本番 URL と WebAuthn の RP_ID は `matatabetai.shiraoka.workers.dev`。passkey を登録した後にホストを変えると既存の credential がすべて無効になるので、`wrangler.jsonc` の `name` / `vars.RP_ID` / `vars.ORIGIN` は変えない。custom domain へ移るなどで変えるなら、先に credential の移し方を ADR で決める。
- 写真は private R2 に置き、Worker が中継して配る。public bucket・`r2.dev`・公開オリジン前提の画像変換は使わず、縮小はクライアントで行う（ADR-004）。
- Cron Triggers は kokemusu への日次投稿（ADR-013）の 1 本だけにし、ほかの定期実行は持たない（Workers Free の Cron はアカウントで 5 本）。
- デプロイは Workers Builds（キーレス）で、`main` への merge が build・本番 D1 への migration の適用・deploy まで進む。GitHub に Cloudflare の資格情報は置かない。非本番ブランチのビルドは OFF にしてある（preview も本番 D1 を掴むため）。Workers Builds は CI を待たないので、`main` が green であることは ruleset（PR 必須・required check `ci`・force push 禁止・bypass なし）が守る。D1 は本番の `matatabetai` 1 つで、staging を足すなら `matatabetai-staging` にする。

## コマンドと罠

- 開発はコンテナ内で行う（起動は `./up.sh`）。ルートから `pnpm dev -- --host 0.0.0.0`（ホストからは http://localhost:5573/）、`pnpm check`、`pnpm test`、`pnpm build`。CI は `bash .claude/hooks/check-status.sh` と `pnpm run ci` を走らせる。format と lint は入れていない。ローカルの変数は `packages/web/.dev.vars`（`.dev.vars.example` をコピーする）。
- `worker-configuration.d.ts` は gitignore した生成物で、`pnpm check`（または `pnpm types`）が `wrangler.jsonc` から作る。clone の直後や `wrangler.jsonc` を変えた後に型が合わなければ流し直す。
- ホストで開いたセッションでは、編集と git はホストで行い、pnpm・npx・wrangler などは `docker compose exec -T dev <コマンド>` でコンテナに投げる。ホストで直に叩くと `require-container` hook が止める（依存のコードが隔離の外で動き、コンテナの `node_modules` も壊れる）。作業ツリーはコンテナと共有しているので、ブランチの切り替えはコンテナ側にも効く。
- `pnpm e2e` は Playwright の 4 spec で、ローカル D1 の dev データを全部消す。CI では回さない（`packages/web/e2e/README.md`）。
- migration（`packages/web/drizzle/`）を書く前に skill `cloudflare-d1-drizzle-migration` を読む。生成は `packages/web` で `pnpm db:generate --name <要約>`（`--` を挟むと drizzle-kit が落ちる）、ローカルへの適用は `pnpm db:migrate`。本番への適用は merge 後に Workers Builds が行う。人手で当てる経路（`docs/local-dev.md`）は持ち主が使う。

## 書き方

- ドメインは型で不正な状態を表せないようにする。状態は Discriminated Union で表し、分岐の網羅を型で保証する（例: `packages/web/worker/domain/link-preview.ts`）。制約は Zod で検証し、検証済みの値は `unique symbol` の Branded Type で区別する（例: `meal.ts`）。ロジックは純粋関数に寄せ、I/O は境界に置く。
- エラーは `neverthrow` の `Result` で返し、`throw` で伝えない。`any` と `class` は使わない。抽象化は今の要件に要る分だけにする。型と関数名で伝わることを、コメントや文書に書かない。
- ユニットテスト（vitest）は純粋関数の意味を固定するもので、I/O を持ち込まず、モックもしない。モックが要るならそれは e2e の領域。型で保証済みのことはテストにしない。e2e は配線と「存在の事実」を見る数本に保ち、ドメインの意味・見た目の動き・入力検証の網羅は入れない。
- UI はブラウザのネイティブ機能を先に使う（skill `modern-web-guidance`。React は `vercel-react-best-practices`）。Baseline Newly available まで使ってよく、polyfill と重い fallback は入れない。
- API は記憶で断定せず、公式 docs で確かめる（`cloudflare-docs` MCP、`context7` MCP、各サイトの `/llms.txt`）。コンテナの firewall は allowlist 外の URL を通さない。

## git と merge

- `claude/<type>-<topic>` に commit し、push して `gh pr create` する。commit の subject と PR の題は Conventional Commits で書く（説明は日本語でよい）。squash の subject には、commit が 1 つなら commit の subject、2 つ以上なら PR の題が使われる。PR 本文には計画と確かめたことを書き、PR の URL を報告する。コンテナでは PR 本文の修正を `gh pr comment` で行う（古い gh では `gh pr edit` が落ちる）。
- `packages/web/` か依存（`package.json`、`pnpm-lock.yaml`）を変える PR は、arm の前にコンテナで `pnpm e2e` を流し、結果を PR に書く。
- `gh pr checks` で CI が green になったのを確かめたら、`gh pr merge --auto --squash <PR番号>` で arm してよい（`--auto` は required check `ci` が通るまで merge を待たせる）。`--auto` なしの merge と `--admin` は使わない（hook `guard-pr-merge` が止める）。持ち主に merge を頼まれたときは `/merge` の手順で進める。
- `packages/web/drizzle/`、`.github/**`、`.claude/**`、`docs/adr/**` を触る PR は自分から arm しない。持ち主が差分を見たうえで merge を頼んだときだけ（PR ができる前の「merge まで進めて」は含まない）、`/merge` で arm する。migration の PR はさらに、merge の直前にホストで `node ~/.config/d1-backup/d1-bookmark.mjs matatabetai <PR番号>` を実行してもらい、D1 Time Travel の bookmark が PR にコメントされるまで arm しない（コンテナには Cloudflare の資格情報がない。bookmark が無ければ hook も止める）。migration の PR 本文には事後確認の SQL を書き、既存行の書き換え・テーブルの再構築・DROP を含むなら戻し方も書く。
- token は印字しない・URL に埋めない・`gh auth login` しない。コンテナでは token は `./shell.sh` が開いたシェルにだけあり、push が 401 なら回避せず、持ち主に `./shell.sh` を開いてもらう。ホストでは持ち主の gh の認証で push と PR 操作ができる。
- `.github/workflows/**` は持ち主がホストで変える（コンテナの token には workflows 権限がない）。CI の中身は `package.json` の `ci` script、`.node-version`、`.claude/hooks/` で変えられる。
- okayus-skills はコンテナに読み取り専用でマウントされている（このリポに複製しない）。ホストのセッションで skill が見つからなければ `../okayus-skills/skills/<name>/SKILL.md` を読む。`cloudflare-workers-passkey-auth`・`cloudflare-workers-space-membership-invite`・`cloudflare-r2-private-image-upload` の `UNVERIFIED:` の項目や、skill の誤り・新しい罠を確かめたら、直す内容に `(verified YYYY-MM-DD in matatabetai)` を添えて PR 本文か報告に書く。SKILL.md の編集・`metadata.version` の更新・commit / PR はホストで `../okayus-skills` に対して行い（`feat(<skill>): … を還元`）、このリポの PR とは分ける。skill に無い話題は、新しい skill の候補として `docs/roadmap.md` に書く。

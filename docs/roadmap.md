# ロードマップ

「基盤 → 認証と境界 → 記録できる → 振り返れる → 公開前の堅牢化」の順。経緯は [log.md](log.md)、いまの 3 手は [status.md](status.md)（自動注入）。チェックボックスだけ更新し、経緯は書かない。

## Phase 0 — 基盤（完了 2026-08-23）

歩く骨格（5 月、GH Actions deploy）→ サンドボックス・token 注入・docs アクセス・status hub（8 月）。残る人手作業は [plans/host-setup.md](plans/host-setup.md)。

## Phase 1 — 認証と境界

- [x] ツールチェーン更新（wrangler 4 / `@cloudflare/vite-plugin` 1.x / pnpm 11 / vite 8 / TypeScript 7 / `wrangler types`）
- [ ] `ci.yml` の node を 22 → 24 へ（ホストから人手。token に `workflows` 権限が無い）
- [ ] Workers Builds へ移行し `deploy.yml` と GitHub secrets を撤去（儀式は人手、plans/host-setup.md）
- [ ] passkey 認証（招待制、`INITIAL_REGISTRATION_TOKEN` → `wrangler secret put`）— skill `cloudflare-workers-passkey-auth`
- [ ] スペース・メンバー・招待リンク — skill `cloudflare-workers-space-membership-invite`（最初の migration から、`space_id NOT NULL`）

## Phase 2 — 記録できる（MVP）

- [ ] meals / tags / meal_tags / またたべたい（[requirements.md](requirements.md) の設計メモ。実スキーマ投入前に `cloudflare-d1-drizzle-migration` 必読）
- [ ] 写真 — skill `cloudflare-r2-private-image-upload`（クライアント縮小、private R2 `matatabetai-photos`）
- [ ] 投稿時サジェスト（直近の料理名、タグで絞り込み、前回内容の引き継ぎ）
- [ ] e2e 3 spec — `cloudflare-workers-e2e-playwright` / `playwright-e2e-in-docker-sandbox`

## Phase 3 — 振り返れる

- [ ] 料理名の集計（期間）、タグ検索（AND）、またたべたい一覧
- [ ] レシピ URL の OGP 表示（`HTMLRewriter`）— okayus-skills の新 skill 候補
- [ ] 週 / 月の集計 UI、タグクラウド

## Phase 4 — 公開前の堅牢化

- [ ] bot scan 対策・認証 route のレート制限 — `cloudflare-workers-bot-scan-defense`
- [ ] D1 バックアップ — `cloudflare-d1-weekly-backup-via-pr`（public なら git commit 変種は不可 → keyless 変種）
- [ ] 写真のバックアップ方針を ADR に（R2 に PITR なし）
- [ ] 日本語部分一致の FTS5 化（D1 の trigram tokenizer は要確認）、スペース切替 UI

---

## 決めること

1. ~~認証 / 認可 / 写真~~ → ✅ passkey / per-space + 招待リンク / private R2 + Worker proxy（[ADR-001](adr/001-project-initiation.md)、2026-08-22）
2. ~~push / PR 経路~~ → ✅ 1 リポ限定 PAT を 1Password で注入（ADR-001 改訂、2026-08-23）
3. **リポの可視性**: private のままか public にするか。Free プランでは private だと ruleset が効かず、token 経路の境界が hook と deny だけになる。token 配線と Workers Builds の前に決める
4. **ドメイン**: workers.dev のまま行くか。custom domain へ移るなら**初回 passkey 登録より前**（`matatabetai.app` は 2026-05 時点で空き）
5. ~~デプロイ経路~~ → ✅ Workers Builds（キーレス）へ移行（ADR-001 §1。儀式は plans/host-setup.md）
6. **写真のバックアップ**: 既定案「端末に原本が残るので受容」。写真実装時に ADR

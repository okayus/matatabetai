# ロードマップ

「基盤 → 認証と境界 → 記録できる → 振り返れる → 公開前の堅牢化」の順。経緯は [log.md](log.md)、いまの 3 手は [status.md](status.md)（自動注入）。チェックボックスだけ更新し、経緯は書かない。

## Phase 0 — 基盤（完了 2026-08-23）

歩く骨格（5 月、GH Actions deploy）→ サンドボックス・token 注入・docs アクセス・status hub（8 月）。人手で済ませる準備は 2026-09-02 に完了（経緯は [log.md](log.md)）。

## Phase 1 — 認証と境界

- [x] ツールチェーン更新（wrangler 4 / `@cloudflare/vite-plugin` 1.x / pnpm 11 / vite 8 / TypeScript 7 / `wrangler types`）
- [x] `deploy.yml` の pnpm 衝突を直し、両 workflow の node を 24 へ（#12。ci.yml は安定シェル化 #13）
- [x] Workers Builds へ移行し `deploy.yml` と GitHub secrets を撤去（#33。旧デプロイトークンも削除済み）
- [x] passkey 認証（招待制、`INITIAL_REGISTRATION_TOKEN` → `wrangler secret put`）— skill `cloudflare-workers-passkey-auth`
- [x] スペース・メンバー・招待リンク — skill `cloudflare-workers-space-membership-invite`（最初の migration から、`space_id NOT NULL`）

## Phase 2 — 記録できる（MVP）

- [x] meals / tags / meal_tags / またたべたい（[requirements.md](requirements.md) の設計メモ、[ADR-003](adr/003-meals-tags.md)）
- [x] 写真 — skill `cloudflare-r2-private-image-upload`（クライアント縮小、private R2 `matatabetai-photos`）
- [x] 投稿時サジェスト（直近の料理名、タグで絞り込み、前回内容の引き継ぎ）— [ADR-005](adr/005-meal-suggestions.md)
- [x] e2e 3 spec — `cloudflare-workers-e2e-playwright` / `playwright-e2e-in-docker-sandbox`

## Phase 3 — 振り返れる

- [x] 料理名の集計（期間）、タグ検索（AND）、またたべたい一覧 — [ADR-006](adr/006-lookback-stats-tag-search.md)
- [ ] レシピ URL の OGP 表示（`HTMLRewriter`）— okayus-skills の新 skill 候補
- [ ] 週 / 月の集計 UI、タグクラウド

## Phase 4 — 公開前の堅牢化

- [ ] bot scan 対策・認証 route のレート制限 — `cloudflare-workers-bot-scan-defense`
- [ ] D1 バックアップ — `cloudflare-d1-weekly-backup-via-pr`（public なら git commit 変種は不可 → keyless 変種）
- [x] 写真のバックアップ方針を ADR に（R2 に PITR なし）
- [ ] 日本語部分一致の FTS5 化（D1 の trigram tokenizer は要確認）、スペース切替 UI

---

## 決めること

1. ~~認証 / 認可 / 写真~~ → ✅ passkey / per-space + 招待リンク / private R2 + Worker proxy（[ADR-001](adr/001-project-initiation.md)、2026-08-22）
2. ~~push / PR 経路~~ → ✅ 1 リポ限定 PAT を 1Password で注入（ADR-001 改訂、2026-08-23）
3. ~~リポの可視性~~ → ✅ public（2026-08-23）+ `protect-main` / `no-force-push-anywhere` ruleset + auto-merge opt-in（ADR-001 改訂 2026-08-24）
4. ~~ドメイン~~ → ✅ workers.dev のまま（2026-09-01。`matatabetai.shiraoka.workers.dev` に RP_ID/ORIGIN 固定済みで作業なし。後から custom domain へ移るなら credential 移行戦略ごと再検討 — CLAUDE.md「RP_ID / ORIGIN」）
5. ~~デプロイ経路~~ → ✅ Workers Builds（キーレス）へ移行済み（ADR-001 §1、#33。GitHub 側に Cloudflare の credential は無い）
6. ~~写真のバックアップ~~ → ✅ 受容（アプリが持つのは縮小コピーで原本はスマホに残る。[ADR-004](adr/004-meal-photos-r2.md) §7、2026-09-01）

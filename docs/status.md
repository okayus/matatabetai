# いま（status hub）

<!-- 上限 40 行 / 3 KB。見出し 4 つは固定。終わった項目は消して docs/log.md の先頭へ（取り消し線は禁止）。
     8 行を超える節は docs/plans/<topic>.md に切り出す。更新は /handoff。
     セッション開始時に .claude/hooks/session-start.sh がこのファイルを注入する。 -->

## フェーズ

**Phase 2（記録できる）進行中。第一弾（meals / tags / meal_tags / またたべたい、#22・ADR-003）が本番稼働、ドメインは workers.dev で確定（#23）、初回 owner 登録済み（passkey 2 台）で実利用が始まった。残りは写真とサジェスト。** main は `protect-main` ruleset で保護、CI は check + test + build、e2e はコンテナ内で手動。設計は ADR-001〜003、要件は requirements.md、段取りは roadmap.md。

## 次の 3 手

1. **【コンテナ】写真アップロード**（roadmap Phase 2）: skill `cloudflare-r2-private-image-upload` 必読 → `meal_photos` の migration 0003（純増でも `drizzle/` は人間 merge、PR に backup 手順）→ クライアント縮小 + Worker proxy 配信 + UI → e2e。実装はコンテナで先行でき、deploy だけ R2 bucket 待ち
2. **【ホスト】R2 bucket 作成 → Workers Builds 接続**（[plans/host-setup.md](plans/host-setup.md) 5 → 4）: `wrangler r2 bucket create matatabetai-photos`。Workers Builds 移行前に写真を deploy するなら `CLOUDFLARE_API_TOKEN` に R2 Edit を in-place 追加（skill `cloudflare-api-token-permissions`）
3. **【コンテナ】投稿時サジェスト**（requirements 8）: 直近の料理名を DISTINCT で出しタグで絞り込み、選ぶと前回の URL / レシピ / タグを複製して編集（ADR-003 §5 — 編集 API なしの複製方式）

## 詰まり・人手待ち

- 写真機能の deploy は R2 bucket `matatabetai-photos`（host-setup 5）が前提
- `.github/workflows/**` の yaml 自体は token で push 不可のまま（通常の CI 変更は安定シェル化で不要に。action 更新は Dependabot）

## 進行中 PR

- なし

# いま（status hub）

<!-- 上限 40 行 / 3 KB。見出し 4 つは固定。終わった項目は消して docs/log.md の先頭へ（取り消し線は禁止）。
     8 行を超える節は docs/plans/<topic>.md に切り出す。更新は /handoff。
     セッション開始時に .claude/hooks/session-start.sh がこのファイルを注入する。 -->

## フェーズ

**Phase 3（振り返れる）は完了。Phase 4（公開前の堅牢化）に入る: D1 バックアップ → bot scan 対策 → 凍結列・凍結表の掃除。** 2026-09-06 の追い足し #61（記録ボタンを右下に固定）と #62（URL を複数登録、ADR-010 + migration 0006、backfill 済）は本番稼働。部分一致は #58 の `?q=`（LIKE）で稼働済みで残るは FTS5 化だけ。e2e はコンテナ内で手動（4 spec）。設計 ADR-001〜010、段取り roadmap.md（deploy / CI / main 保護の前提は CLAUDE.md）。

## 次の 3 手

1. **【コンテナ】Phase 4 の入口 — D1 バックアップ**: skill `cloudflare-d1-weekly-backup-via-pr` の keyless 変種（GitHub に Cloudflare credential なし。public リポなので git に積む案は要再検討、人手の `wrangler d1 export` 運用も候補）→ 決めたら ADR。**3 手目の rebuild はこれが前提**
2. **【コンテナ】bot scan 対策**: skill `cloudflare-workers-bot-scan-defense` — 認証 route（begin / verify）のレート制限と observability（`ratelimits` は e2e で local 模擬される — skill playwright-e2e-in-docker-sandbox）。ADR-010 §2 が上限 6 本で先送りした「任意 URL fetch の濫用対策」もここへ
3. **【コンテナ】凍結列・凍結表の掃除**: バックアップ整備後の rebuild で `meals` の `recipe_source_type` / `url` / CHECK（ADR-007 §2）と `recipe_url` / `shop_url` + `meal_link_previews` 表（ADR-010 §3）をまとめて落とす（skill `cloudflare-d1-drizzle-migration` の runbook。人間 merge）

## 詰まり・人手待ち

- **【人間】#41 の実サイト確認**: 本番でレシピ URL を貼って投稿 → 読み直してカードが出るか（sandbox は egress 制限で試せない）。落ちれば `wrangler tail` に `[link-preview] fetch failed`
- **【人間】旧 `url` 投稿の仕分け**: #39 の backfill は一律レシピ扱い。お店・商品だった投稿は #49 の編集 UI で直せる
- **【人間】レシピ本文取り込みの前提**: cookpad 等の利用規約の原文をホストのブラウザで確認。JSON-LD `schema.org/Recipe` 路線が本命（取得の配線は #41 済み）
- **【人間】スマホ実機での確認待ち**: #39 以降の 10 件（#61 の右下ボタン・#62 の URL 欄まで）は [plans/mobile-check.md](plans/mobile-check.md)。確認できた行から消す
- `.github/workflows/**` は token で push 不可（残り `ci.yml` 1 本、action 更新は Dependabot）

## 進行中 PR

- なし

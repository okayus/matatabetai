# いま（status hub）

<!-- 上限 40 行 / 3 KB。見出し 4 つは固定。終わった項目は消して docs/log.md の先頭へ（取り消し線は禁止）。
     8 行を超える節は docs/plans/<topic>.md に切り出す。更新は /handoff。
     セッション開始時に .claude/hooks/session-start.sh がこのファイルを注入する。 -->

## フェーズ

**Phase 3 は完了。次は Phase 5 = kokemusu への日次投稿（[ADR-013](adr/013-kokemusu-daily-push.md)、grill 済み）→ Phase 4 の bot scan → 凍結列の掃除。D1 バックアップは後回し**（持ち主の指示 2026-09-11。Time Travel 7 日は常時効く）。部分一致は `?q=` 稼働済みで残るは FTS5 化だけ。e2e はコンテナ内で手動（4 spec）。設計 ADR-001〜013、段取り roadmap.md。

## 次の 3 手

1. **【人間】#68（ADR-013）を merge** → **【コンテナ】kokemusu 連携の実装 PR**（段取りは [plans/kokemusu-push.md](plans/kokemusu-push.md)。migration 0008 は additive、人間 merge）
2. **【コンテナ】bot scan 対策**: skill `cloudflare-workers-bot-scan-defense` — 認証 4 route（register / login の begin / verify）に `ratelimits`（IP キー・fail-open）。任意 URL fetch は上限 6 本（ADR-010 §2）で据え置き
3. **【コンテナ】凍結列の掃除（形は要決定）**: `recipe_url` / `shop_url` は `DROP COLUMN`、`meal_link_previews` は `DROP TABLE` で rebuild なしに落とせる（ローカル D1 で確認済み）。CHECK 付きの `recipe_source_type` / `url` は rebuild が要るので凍結のまま

## 詰まり・人手待ち

- **【人間】kokemusu の準備**: PAT 発行 → `wrangler secret put KOKEMUSU_PAT`、自分の user id をコンテナへ、アカウントの Cron 本数（Free は 5）— 手順は plans/kokemusu-push.md
- **【人間】#41 の実サイト確認**: 本番でレシピ URL を貼って投稿 → カードが出るか（落ちれば `wrangler tail` に `[link-preview] fetch failed`）
- **【人間】旧 `url` 投稿の仕分け**: #39 の backfill は一律レシピ扱い。お店・商品だった投稿は編集 UI で直す
- **【人間】レシピ本文取り込みの前提**: cookpad 等の利用規約の原文をホストのブラウザで確認（JSON-LD `schema.org/Recipe` 路線が本命）
- **【人間】スマホ実機での確認待ち**: [plans/mobile-check.md](plans/mobile-check.md)。確認できた行から消す
- `.github/workflows/**` は token で push 不可（残り `ci.yml` 1 本、action 更新は Dependabot）

## 進行中 PR

- #68 ADR-013 kokemusu への日次投稿（`docs/adr` を含むので人間 merge）

# いま（status hub）

<!-- 上限 40 行 / 3 KB。見出し 4 つは固定。終わった項目は消して docs/log.md の先頭へ（取り消し線は禁止）。
     8 行を超える節は docs/plans/<topic>.md に切り出す。更新は /handoff。
     セッション開始時に .claude/hooks/session-start.sh がこのファイルを注入する。 -->

## フェーズ

**Phase 3（振り返れる）進行中 — 第一弾（ふりかえり /lookback: またたべたい一覧・料理名の期間集計・タグ検索 AND）が本番稼働（#31、ADR-006）。記録系は Phase 2 で完了（#22 / #27 / #29）。** deploy は Workers Builds（キーレス、#33）で `main` push 起動。main は `protect-main` ruleset で保護、CI は check + test + build、e2e はコンテナ内で手動（`pnpm e2e` 7 passed）。設計は ADR-001〜006、要件は requirements.md、段取りは roadmap.md。

## 次の 3 手

1. **【コンテナ】レシピ URL の OGP 表示**（roadmap Phase 3、requirements「決めていないこと」）: `HTMLRewriter` で取得、hotlink はしない。取得の境界（投稿時 or 表示時）とキャッシュの置き場を ADR で決めてから。okayus-skills の新 skill 候補
2. **【コンテナ】週 / 月の集計 UI とタグクラウド**（roadmap Phase 3 残り）: API は #31 の `/meals/stats?from&to` のままで足りる（プリセットが期間を組み立てるだけ）。requirements「決めていないこと」の期間 UI をここで決める
3. **【コンテナ】D1 バックアップ**（roadmap Phase 4 頭出し）: リポが public なので skill `cloudflare-d1-weekly-backup-via-pr` の git commit 変種は使えない。Cron Triggers も不採用なので、置き場と起動の両方を ADR で決める

## 詰まり・人手待ち

- **okayus-skills #39 が open**: Workers Builds skill 0.4.0（既存 Worker の接続経路）。push 起動の実証を書いた追い commit がローカル未 push（`block-main-commit.sh` がホストの cwd を見るため人手）
- **スマホ実機確認が未**: サジェストの札（記録が数件ないと出ない）と、#31 のふりかえり（♥ 既定・タグ絞り込み・集計）
- `.github/workflows/**` の yaml は token で push 不可のまま（残るは `ci.yml` 1 本。action 更新は Dependabot）

## 進行中 PR

- なし

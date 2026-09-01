# いま（status hub）

<!-- 上限 40 行 / 3 KB。見出し 4 つは固定。終わった項目は消して docs/log.md の先頭へ（取り消し線は禁止）。
     8 行を超える節は docs/plans/<topic>.md に切り出す。更新は /handoff。
     セッション開始時に .claude/hooks/session-start.sh がこのファイルを注入する。 -->

## フェーズ

**Phase 2（記録できる）進行中。第一弾（meals / tags / またたべたい、#22・ADR-003）に続き写真が本番稼働（#27・ADR-004 — meal_photos + private R2 + Worker proxy 配信、スマホからの写真付き投稿を実機確認済み）。Phase 2 の残りは投稿時サジェストのみ。** main は `protect-main` ruleset で保護、CI は check + test + build、e2e はコンテナ内で手動。設計は ADR-001〜004、要件は requirements.md、段取りは roadmap.md。

## 次の 3 手

1. **【コンテナ】投稿時サジェスト**（requirements 8、ADR-003 §5 の複製方式）: 投稿フォームで直近の料理名を DISTINCT で出しタグで絞り込み、選ぶと前回の URL / レシピ / タグを複製して編集 → 新規投稿。これで Phase 2（MVP）完了
2. **【ホスト】Workers Builds 接続**（[plans/host-setup.md](plans/host-setup.md) 4）: dash の儀式 → `deploy.yml` 削除 PR（人手 push）→ secrets と旧トークンの退役。dash 生成トークンは D1 / R2 Edit を含む（skill `cloudflare-workers-builds-keyless-deploy` 0.3.0）
3. **【コンテナ】Phase 3 の頭出し — またたべたい一覧・料理名集計・タグ検索**（roadmap Phase 3、requirements 6/7）: サジェストの後に。クエリは requirements「主要クエリ」が正典

## 詰まり・人手待ち

- `.github/workflows/**` の yaml 自体は token で push 不可のまま（通常の CI 変更は安定シェル化で不要に。action 更新は Dependabot）

## 進行中 PR

- なし

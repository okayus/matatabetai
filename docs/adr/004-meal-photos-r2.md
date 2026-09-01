# ADR-004: 写真（meal_photos / private R2 / Worker proxy 配信）の実装で確定した決定

- ステータス: 承認
- 日付: 2026-09-01

## コンテキスト

requirements.md 機能要件 2「画像アップロード — 投稿に写真を付けられる（複数可）。写真は家族以外に見えない」を Phase 2 で実装した（migration 0003、skill `cloudflare-r2-private-image-upload` 0.1.0 の最初の消費者）。家族の写真は private データであり、cookie なしで開ける URL（public bucket / r2.dev / 署名 URL）を 1 度でも作ると失効の術を失う。

## 決定

### 1. private R2 + Worker proxy 配信（公開経路は作らない）

bucket は `matatabetai-photos`（private、公開アクセス・r2.dev・custom domain なし）。配信は `GET /api/spaces/:spaceId/meals/:mealId/photos/:photoId` のみで、JSON API と同じ sessionMiddleware + spaceMiddleware を通ってから R2 に触る。photo 行は meals と join して space_id まで一致した時だけ見え、横流れはすべて 404。`<img src="/api/…">` は同一オリジンなので cookie が自動で付き、CSP も認可モデルも変わらない。`Cache-Control: private, max-age=3600`（public と Cache API は URL キーの edge cache に他家族へ配られるので禁止）、`If-None-Match` は R2 の `onlyIf` に渡して 304。

### 2. スキーマ: meal_photos は meals の CASCADE 子、寸法は NOT NULL

`meal_photos (id, meal_id FK CASCADE, r2_key, thumb_key NULL, content_type, size_bytes, width, height, created_by, created_at)` + index(meal_id)。space_id は持たず親経由（認可境界は meals.space_id、CLAUDE.md）。width / height はクライアントの canvas 縮小結果で必ずあるので NOT NULL（`<img>` の寸法予約 = CLS 回避に使う）。original_filename は保存しない（表示に不要、日本語ファイル名の Content-Disposition 問題も持ち込まない）。created_by は ADR-003 §3 と同じく表示・監査用で cascade しない。

### 3. R2 キーは `photos/<spaceId>/<mealId>/<photoId>`（拡張子なし）、サムネは `<key>/w320`

content type はアップロード時に **magic bytes で sniff した値**を行と R2 httpMetadata の両方に保存し、配信はそれを返す（file.type は信じない。キーからの推測もしない）。spaceId 接頭辞で 1 家族分を `list({ prefix })` で監査・一括削除できる。

### 4. クライアントで縮小（1600px / 320px サムネの 2 変形、EXIF・GPS 除去）

`createImageBitmap(file, { imageOrientation: "from-image" })` → canvas → JPEG 0.85 で本体 ≤1600px とサムネ ≤320px を作って multipart で送る。canvas 再エンコードは EXIF（自宅の GPS）を運ばず、3–8 MB が数百 KB になり R2 無料枠（10 GB-month）が数万枚分になる。サムネは Images binding でなくクライアント生成（変換課金ゼロ、ローカル / e2e が本番と同一）。thumb_key は NULL 許容で、無ければ本体に fallback。

### 5. HEIC はサーバーで 415、変換はクライアントの責務

デコードできない端末（Chrome / Android の HEIC）では `preparePhoto` が null を返しアップロードせず案内を出す。Safari は HEIC を canvas にデコードできるので iPhone からは JPEG になって届く。サーバーは sniff で HEIC を識別して 415 — Android の家族が壊れた `<img>` を見る状態を作らない。

### 6. アップロードは put → INSERT、削除は R2 → D1

put 後の INSERT が失敗したら置いた object を補償削除して投げ直す（行だけ残る恒久 404 より、その場で消せる orphan を選ぶ）。削除は R2 を先に消してから行を消す（R2 障害時は行が残って再試行可能）。meal 削除は key を集めて配列 1 回の `delete(keys)` → meals DELETE（行は CASCADE）。取り残しの orphan object は家族規模ではコストゼロなので定期掃除は持たない（要るようになったら list − rows の週次 sweep、Cron は当面使わない方針のまま）。

### 7. バックアップ: 受容（同期しない）

R2 に PITR は無い（2026-08 時点、bucket lock は削除防止のみでアプリの削除機能と両立しない）。**本アプリが保存するのは縮小コピーで、原本は家族のスマホに残る**ため、bucket 消失リスクは受容する。D1 は従来どおり（weekly backup は host-setup 後に skill `cloudflare-d1-weekly-backup-via-pr` で検討）。写真をアーカイブ級に扱う要件が出たら rclone + R2 S3 token の週次 sync を再訪する。

## 影響

- migration 0003 は純増（CREATE TABLE / CREATE INDEX のみ）。それでも merge 前 backup は runbook どおり取る
- deploy には bucket `matatabetai-photos` の作成（host-setup 5）と deploy token の `Workers R2 Storage: Edit` が必要。無いと `Authentication error [code: 10000]` で deploy が落ちる（wrangler.jsonc に binding を足した瞬間から）
- e2e はアップロード → 配信 → 304 → 削除 → meal 削除連鎖を golden path で、写真ルートの横流れ 404 を boundary で固定した。ローカル R2 は Miniflare 模擬で資格情報不要

## 却下した選択肢

- public bucket / r2.dev / 署名 URL — URL が漏れた瞬間に失効不能。「いったん公開で」は無い
- Cloudflare Images(stored) — 月 100 枚規模に固定費（$5/100k 保存 + $1/100k 配信）は不釣り合い
- Images binding のサーバー側サムネ — 無料枠 5,000 変換 / 月超過で 9422、ローカル dev は低忠実。クライアント 2 変形で足りる
- presigned S3 direct upload — 家族規模で得るものがなく token 種別が増える
- 投稿後の写真追加 UI — MVP は投稿フォームで添付 + 個別削除のみ（API は `POST /photos` が既にあるので UI だけの話。要望が出たら足す）

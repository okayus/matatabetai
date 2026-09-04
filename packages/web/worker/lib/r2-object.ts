// private R2 の object を Worker から配る（skill cloudflare-r2-private-image-upload）。
// 認可（どの行がどのキーを指すか）は呼び出し側の責務で、ここは「通った後の配り方」だけを持つ。
// 写真（photos/…）と URL プレビューの og:image（ogp/…）が同じ規則で配られる。
export async function serveR2Object(
  bucket: R2Bucket,
  key: string,
  requestHeaders: Headers,
  fallbackContentType: string,
  // 既定は写真向け（id ごとに URL が一意 = 中身は変わらない）。URL が固定で中身が
  // 変わり得るものだけ "private, no-cache" を渡す（ADR-008 §5）
  cacheControl = "private, max-age=3600",
): Promise<Response | null> {
  // onlyIf: ブラウザの If-None-Match / If-Modified-Since を R2 に評価させる
  const obj = await bucket.get(key, { onlyIf: requestHeaders });
  // 行はあるのに object が無い＝不整合（削除順序が守られていれば起きない）。判断は呼び出し側に返す
  if (obj === null) return null;

  const headers = new Headers({
    // public にすると edge cache が cookie を見ずに配る。Cache API も使わない
    "Cache-Control": cacheControl,
    ETag: obj.httpEtag,
    "X-Content-Type-Options": "nosniff",
  });
  if (!("body" in obj)) {
    // precondition 成立 → body なしの R2Object が返る → 304
    return new Response(null, { status: 304, headers });
  }
  // content type は object 側（put 時の sniff 結果）を優先する
  headers.set("Content-Type", obj.httpMetadata?.contentType ?? fallbackContentType);
  // D1 の size_bytes は使わない（再アップロード等で object と食い違い得る）
  headers.set("Content-Length", String(obj.size));
  // filename は付けない（日本語名は RFC 5987 が要る。inline 表示に名前は不要）
  headers.set("Content-Disposition", "inline");
  return new Response(obj.body, { status: 200, headers });
}

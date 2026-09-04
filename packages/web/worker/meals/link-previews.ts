import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/d1";
import { mealLinkPreviews, meals } from "../db/schema";
import {
  absoluteHttpUrl,
  linkPreviewImageKey,
  sortByKind,
  toLinkPreview,
  toSnapshot,
  type LinkPreview,
  type LinkPreviewKind,
  type LinkPreviewSnapshot,
  type LinkPreviewTarget,
  type OgpCandidates,
  type SavedLinkPreview,
} from "../domain/link-preview";
import type { MealId } from "../domain/meal";
import { isAllowedImageType, sniffImageType } from "../domain/photo";
import type { SpaceId } from "../domain/space";
import type { ImageBytes } from "./photos";

type Db = ReturnType<typeof drizzle>;

// 投稿のレスポンスを返した後に waitUntil で走る（ADR-007 §3）。waitUntil の壁時計 30 秒に
// 「2 本の URL × (ページ + 画像)」が収まるよう、1 リクエストずつ短く切る。
// 途中で殺されても行は pending のままで、表示はプレーンリンク（= 壊れない）
const FETCH_TIMEOUT_MS = 5_000;
const MAX_HTML_BYTES = 512 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
// 正直に名乗る（弾きたいサイトが弾ける）。deploy 先に関わらずこの bot の識別子なので固定文字列
const USER_AGENT = "MatatabetaiBot/1.0 (+https://matatabetai.shiraoka.workers.dev)";
const OG_PROPERTIES = new Set(["og:title", "og:description", "og:site_name", "og:image"]);
// <title> は見出しの候補にしかならないので、切り詰める前でもこの長さで読むのをやめる
const MAX_TITLE_SOURCE_CHARS = 500;

// 投稿の INSERT と同じ batch に混ぜる文（ADR-007 §4）。meal と一緒に原子的に pending 行ができる
export function pendingPreviewStatements(
  d1: D1Database,
  mealId: string,
  targets: readonly LinkPreviewTarget[],
  now: string,
): D1PreparedStatement[] {
  return targets.map((t) =>
    d1
      .prepare(
        "INSERT INTO meal_link_previews (meal_id, kind, url, status, created_at) VALUES (?, ?, ?, 'pending', ?)",
      )
      .bind(mealId, t.kind, t.url, now),
  );
}

// 編集で「同じ URL か」を判定するための保存済みの行（ADR-008 §5）。
// 他の meal 参照と同じく meals と join して space_id まで一致した時だけ見る
export async function savedPreviewsOfMeal(
  db: Db,
  spaceId: SpaceId,
  mealId: MealId,
): Promise<SavedLinkPreview[]> {
  return await db
    .select({
      kind: mealLinkPreviews.kind,
      url: mealLinkPreviews.url,
      imageR2Key: mealLinkPreviews.imageR2Key,
    })
    .from(mealLinkPreviews)
    .innerJoin(meals, eq(mealLinkPreviews.mealId, meals.id))
    .where(and(eq(mealLinkPreviews.mealId, mealId), eq(meals.spaceId, spaceId)));
}

// 捨てる行（URL が変わった / 消えた kind）。R2 の画像は呼び出し側が先に消す（ADR-004 §6）
export function stalePreviewStatements(
  d1: D1Database,
  mealId: string,
  kinds: readonly LinkPreviewKind[],
): D1PreparedStatement[] {
  return kinds.map((kind) =>
    d1.prepare("DELETE FROM meal_link_previews WHERE meal_id = ? AND kind = ?").bind(mealId, kind),
  );
}

// 一覧用。meal は呼び出し側が space で絞った id 群なので join は不要（photosByMealIds と同じ）
export async function previewsByMealIds(
  db: Db,
  mealIds: string[],
): Promise<Map<string, LinkPreview[]>> {
  const map = new Map<string, LinkPreview[]>();
  if (mealIds.length === 0) return map;
  const rows = await db
    .select({
      mealId: mealLinkPreviews.mealId,
      kind: mealLinkPreviews.kind,
      status: mealLinkPreviews.status,
      title: mealLinkPreviews.title,
      description: mealLinkPreviews.description,
      siteName: mealLinkPreviews.siteName,
      imageR2Key: mealLinkPreviews.imageR2Key,
    })
    .from(mealLinkPreviews)
    .where(inArray(mealLinkPreviews.mealId, mealIds));
  for (const { mealId, ...row } of rows) {
    const list = map.get(mealId) ?? [];
    list.push(toLinkPreview(row));
    map.set(mealId, list);
  }
  for (const list of map.values()) sortByKind(list);
  return map;
}

// 画像を配る route の認可。meals と join して space_id まで一致した時だけキーを返す
export async function linkPreviewImageKeyOf(
  db: Db,
  spaceId: SpaceId,
  mealId: MealId,
  kind: LinkPreviewKind,
): Promise<string | null> {
  const rows = await db
    .select({ imageR2Key: mealLinkPreviews.imageR2Key })
    .from(mealLinkPreviews)
    .innerJoin(meals, eq(mealLinkPreviews.mealId, meals.id))
    .where(
      and(
        eq(mealLinkPreviews.mealId, mealId),
        eq(mealLinkPreviews.kind, kind),
        eq(meals.spaceId, spaceId),
      ),
    );
  return rows[0]?.imageR2Key ?? null;
}

// 親 meal 削除用（行は CASCADE で消えるので R2 だけがこちらの責務 — photoKeysOfMeal と同じ）
export async function linkPreviewImageKeysOfMeal(
  db: Db,
  spaceId: SpaceId,
  mealId: MealId,
): Promise<string[]> {
  const rows = await db
    .select({ imageR2Key: mealLinkPreviews.imageR2Key })
    .from(mealLinkPreviews)
    .innerJoin(meals, eq(mealLinkPreviews.mealId, meals.id))
    .where(
      and(
        eq(meals.id, mealId),
        eq(meals.spaceId, spaceId),
        isNotNull(mealLinkPreviews.imageR2Key),
      ),
    );
  return rows.flatMap((r) => (r.imageR2Key === null ? [] : [r.imageR2Key]));
}

// --- 取得（ここから下が外向きの IO） --------------------------------------------------------

// 投稿のレスポンス後に走る本体。1 本が転んでも他方は独立に完了する
export async function runLinkPreviewJobs(
  d1: D1Database,
  bucket: R2Bucket,
  spaceId: SpaceId,
  mealId: string,
  targets: readonly LinkPreviewTarget[],
): Promise<void> {
  await Promise.all(targets.map((target) => runOne(d1, bucket, spaceId, mealId, target)));
}

async function runOne(
  d1: D1Database,
  bucket: R2Bucket,
  spaceId: SpaceId,
  mealId: string,
  target: LinkPreviewTarget,
): Promise<void> {
  const snapshot = await fetchSnapshot(target.url);
  // R2 を先に置く（skill cloudflare-r2-private-image-upload）。行が先だと壊れた <img> が残るが、
  // object だけが残る形は下の compensating delete で消せる
  let imageKey: string | null = null;
  if (snapshot !== null && snapshot.imageUrl !== null) {
    const key = linkPreviewImageKey(spaceId, mealId, target.kind, crypto.randomUUID());
    if (await storeImage(bucket, key, snapshot.imageUrl)) imageKey = key;
  }

  // url も条件に入れる（ADR-008 §6）。取得中に投稿が編集されて URL が変わっていたら、
  // この結果は「別の URL の姿」なので書かない
  const written = await d1
    .prepare(
      "UPDATE meal_link_previews SET status = ?, title = ?, description = ?, site_name = ?, image_r2_key = ?, fetched_at = ? WHERE meal_id = ? AND kind = ? AND url = ?",
    )
    .bind(
      snapshot === null ? "failed" : "ok",
      snapshot?.title ?? null,
      snapshot?.description ?? null,
      snapshot?.siteName ?? null,
      imageKey,
      new Date().toISOString(),
      mealId,
      target.kind,
      target.url,
    )
    .run();
  // 取得中に投稿が消えた / URL が貼り替わった。置いたばかりの画像は誰も参照しないので消す
  // （キーは取得ごとに固有なので、後から走ったジョブの画像を消す心配はない）
  if (written.meta.changes === 0 && imageKey !== null) await bucket.delete(imageKey);
}

async function fetchSnapshot(url: string): Promise<LinkPreviewSnapshot | null> {
  try {
    const fetched = await fetchWithGuards(url, "text/html,application/xhtml+xml");
    if (fetched === null) return null;
    // text/html 以外は読まずに捨てる（PDF や画像を HTMLRewriter に流さない — ADR-007 §6）
    const contentType = fetched.res.headers.get("content-type") ?? "";
    if (!/^\s*(text\/html|application\/xhtml\+xml)\s*(;|$)/i.test(contentType)) {
      await fetched.res.body?.cancel();
      return null;
    }
    return toSnapshot(await extractCandidates(fetched.res), fetched.url);
  } catch (e) {
    // URL 全体はユーザーの記録なのでログに残さない（どのサイトで転ぶかだけ分かればよい）
    console.error("[link-preview] fetch failed", hostOf(url), e);
    return null;
  }
}

async function storeImage(bucket: R2Bucket, key: string, imageUrl: string): Promise<boolean> {
  try {
    const image = await fetchImage(imageUrl);
    if (image === null) return false;
    await bucket.put(key, image.bytes, { httpMetadata: { contentType: image.contentType } });
    return true;
  } catch (e) {
    console.error("[link-preview] image fetch failed", hostOf(imageUrl), e);
    return false;
  }
}

async function fetchImage(imageUrl: string): Promise<ImageBytes | null> {
  const fetched = await fetchWithGuards(imageUrl, "image/*");
  if (fetched === null) return null;
  const declared = Number(fetched.res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
    await fetched.res.body?.cancel();
    return null;
  }
  const bytes = await readCapped(fetched.res, MAX_IMAGE_BYTES);
  if (bytes === null) return null;
  // 申告 content-type は見ず先頭バイトだけを信じる（写真アップロードと同じ規則）。
  // ブラウザに配れない形式（HEIC / SVG / その他）はカードなしにする
  const contentType = sniffImageType(bytes.subarray(0, 12));
  return isAllowedImageType(contentType) ? { bytes, contentType } : null;
}

// リダイレクトは自分で辿る（上限つき・各ホップで http(s) を確かめる）。
// 到達できるのは公開インターネットだけ（Workers に内部ネットワークは無い）。ローカル宛が
// 通るのは wrangler dev のときだけで、e2e はそれを使って固定 HTML を配る（ADR-007 §7）
async function fetchWithGuards(
  url: string,
  accept: string,
): Promise<{ res: Response; url: string } | null> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(current, {
      headers: { "User-Agent": USER_AGENT, Accept: accept },
      redirect: "manual",
      // 応答ヘッダだけでなく body の読み出しもこの signal で打ち切られる
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status < 300 || res.status >= 400) {
      // 2xx 以外（bot ブロックの 403 など）はカードなし。body は読まずに捨てる
      if (!res.ok) {
        await res.body?.cancel();
        return null;
      }
      return { res, url: current };
    }
    const location = res.headers.get("location");
    await res.body?.cancel();
    if (location === null) return null;
    const next = absoluteHttpUrl(location, current);
    if (next === null) return null;
    current = next;
  }
  return null;
}

async function extractCandidates(res: Response): Promise<OgpCandidates> {
  const og = new Map<string, string>();
  let htmlTitle = "";
  const rewriter = new HTMLRewriter()
    .on("meta", {
      element(el) {
        // OGP は property、一部のサイトは name で書く。同じ key は先勝ち
        const key = el.getAttribute("property") ?? el.getAttribute("name");
        const content = el.getAttribute("content");
        if (key === null || content === null || !OG_PROPERTIES.has(key) || og.has(key)) return;
        og.set(key, content);
      },
    })
    // <title> は head のものだけ（SVG の <title> を見出しに混ぜない）
    .on("head title", {
      text(chunk) {
        if (htmlTitle.length < MAX_TITLE_SOURCE_CHARS) htmlTitle += chunk.text;
      },
    });
  const body = res.body;
  if (body === null) {
    return { ogTitle: null, ogDescription: null, ogSiteName: null, ogImage: null, htmlTitle: null };
  }
  // transform の戻りを読み切ることで stream が流れる。上限までで打ち切るので
  // 巨大なページでも head の後ろまで付き合わない
  await rewriter.transform(new Response(capBytes(body, MAX_HTML_BYTES))).arrayBuffer();
  return {
    ogTitle: og.get("og:title") ?? null,
    ogDescription: og.get("og:description") ?? null,
    ogSiteName: og.get("og:site_name") ?? null,
    ogImage: og.get("og:image") ?? null,
    htmlTitle: htmlTitle === "" ? null : htmlTitle,
  };
}

// max バイトまで流して打ち切る stream
function capBytes(body: ReadableStream<Uint8Array>, max: number): ReadableStream<Uint8Array> {
  let seen = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        const room = max - seen;
        if (chunk.byteLength < room) {
          seen += chunk.byteLength;
          controller.enqueue(chunk);
          return;
        }
        controller.enqueue(chunk.subarray(0, room));
        controller.terminate();
      },
    }),
  );
}

// max を 1 バイトでも超えたら null（大きすぎる画像は諦める。途中まで保存はしない）
async function readCapped(res: Response, max: number): Promise<Uint8Array | null> {
  const body = res.body;
  if (body === null) return null;
  const buf = await new Response(capBytes(body, max + 1)).arrayBuffer();
  return buf.byteLength > max ? null : new Uint8Array(buf);
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "(invalid url)";
  }
}

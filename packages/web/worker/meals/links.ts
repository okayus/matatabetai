import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/d1";
import { mealLinks, meals } from "../db/schema";
import {
  absoluteHttpUrl,
  linkPreviewImageKey,
  sortLinks,
  toMealLink,
  toSnapshot,
  type LinkPreviewSnapshot,
  type LinkPreviewTarget,
  type MealLink,
  type NewLink,
  type OgpCandidates,
  type PlannedLink,
  type SavedLink,
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

// 投稿の INSERT と同じ batch に混ぜる文（ADR-007 §4）。meal と一緒に原子的に pending 行ができる。
// 行の id はここで採る（純粋な計画には無い — ADR-010 §4）ので、取りに行く先も一緒に返す
export function addedLinkStatements(
  d1: D1Database,
  mealId: string,
  added: readonly PlannedLink[],
  now: string,
): { statements: D1PreparedStatement[]; rows: NewLink[] } {
  const rows: NewLink[] = added.map((link) => ({ ...link, id: crypto.randomUUID() }));
  return {
    statements: rows.map((row) =>
      d1
        .prepare(
          "INSERT INTO meal_links (id, meal_id, kind, position, url, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)",
        )
        .bind(row.id, mealId, row.kind, row.position, row.url, now),
    ),
    rows,
  };
}

// 立てた行 → 取りに行く先（waitUntil に渡す分）
export function fetchTargets(rows: readonly NewLink[]): LinkPreviewTarget[] {
  return rows.map((row) => ({ id: row.id, url: row.url }));
}

// 編集で足し引きを決めるための保存済みの行（ADR-008 §5）。
// 他の meal 参照と同じく meals と join して space_id まで一致した時だけ見る
export async function savedLinksOfMeal(
  db: Db,
  spaceId: SpaceId,
  mealId: MealId,
): Promise<SavedLink[]> {
  return await db
    .select({
      id: mealLinks.id,
      kind: mealLinks.kind,
      url: mealLinks.url,
      position: mealLinks.position,
      imageR2Key: mealLinks.imageR2Key,
    })
    .from(mealLinks)
    .innerJoin(meals, eq(mealLinks.mealId, meals.id))
    .where(and(eq(mealLinks.mealId, mealId), eq(meals.spaceId, spaceId)));
}

// 捨てる行（入力から URL が消えた）。R2 の画像は呼び出し側が先に消す（ADR-004 §6）
export function removedLinkStatements(
  d1: D1Database,
  mealId: string,
  ids: readonly string[],
): D1PreparedStatement[] {
  return ids.map((id) =>
    d1.prepare("DELETE FROM meal_links WHERE id = ? AND meal_id = ?").bind(id, mealId),
  );
}

// URL は同じで並びだけ変わった行。カード（スナップショット）は触らない
export function repositionedLinkStatements(
  d1: D1Database,
  mealId: string,
  moves: readonly { id: string; position: number }[],
): D1PreparedStatement[] {
  return moves.map((move) =>
    d1
      .prepare("UPDATE meal_links SET position = ? WHERE id = ? AND meal_id = ?")
      .bind(move.position, move.id, mealId),
  );
}

// 一覧用。meal は呼び出し側が space で絞った id 群なので join は不要（photosByMealIds と同じ）
export async function linksByMealIds(
  db: Db,
  mealIds: string[],
): Promise<Map<string, MealLink[]>> {
  const map = new Map<string, MealLink[]>();
  if (mealIds.length === 0) return map;
  const rows = await db
    .select({
      mealId: mealLinks.mealId,
      id: mealLinks.id,
      kind: mealLinks.kind,
      url: mealLinks.url,
      position: mealLinks.position,
      status: mealLinks.status,
      title: mealLinks.title,
      description: mealLinks.description,
      siteName: mealLinks.siteName,
      imageR2Key: mealLinks.imageR2Key,
    })
    .from(mealLinks)
    .where(inArray(mealLinks.mealId, mealIds));
  // 並びは kind → position。DB の返す順に頼らず、ドメインの並び順で確定させる
  for (const { mealId, ...row } of sortLinks(rows)) {
    const list = map.get(mealId) ?? [];
    list.push(toMealLink(row));
    map.set(mealId, list);
  }
  return map;
}

// サジェスト用。前回の投稿のリンクを kind ごとの URL 配列（= フォームの形）にして返す
export async function urlsByMealIds(
  db: Db,
  mealIds: string[],
): Promise<Map<string, { recipeUrls: string[]; shopUrls: string[] }>> {
  const map = new Map<string, { recipeUrls: string[]; shopUrls: string[] }>();
  if (mealIds.length === 0) return map;
  const rows = await db
    .select({
      mealId: mealLinks.mealId,
      kind: mealLinks.kind,
      url: mealLinks.url,
      position: mealLinks.position,
    })
    .from(mealLinks)
    .where(inArray(mealLinks.mealId, mealIds));
  for (const row of sortLinks(rows)) {
    const entry = map.get(row.mealId) ?? { recipeUrls: [], shopUrls: [] };
    (row.kind === "recipe" ? entry.recipeUrls : entry.shopUrls).push(row.url);
    map.set(row.mealId, entry);
  }
  return map;
}

// 画像を配る route の認可。meals と join して space_id まで一致した時だけキーを返す
export async function linkImageKeyOf(
  db: Db,
  spaceId: SpaceId,
  mealId: MealId,
  linkId: string,
): Promise<string | null> {
  const rows = await db
    .select({ imageR2Key: mealLinks.imageR2Key })
    .from(mealLinks)
    .innerJoin(meals, eq(mealLinks.mealId, meals.id))
    .where(
      and(eq(mealLinks.id, linkId), eq(mealLinks.mealId, mealId), eq(meals.spaceId, spaceId)),
    );
  return rows[0]?.imageR2Key ?? null;
}

// 親 meal 削除用（行は CASCADE で消えるので R2 だけがこちらの責務 — photoKeysOfMeal と同じ）
export async function linkImageKeysOfMeal(
  db: Db,
  spaceId: SpaceId,
  mealId: MealId,
): Promise<string[]> {
  const rows = await db
    .select({ imageR2Key: mealLinks.imageR2Key })
    .from(mealLinks)
    .innerJoin(meals, eq(mealLinks.mealId, meals.id))
    .where(
      and(eq(meals.id, mealId), eq(meals.spaceId, spaceId), isNotNull(mealLinks.imageR2Key)),
    );
  return rows.flatMap((r) => (r.imageR2Key === null ? [] : [r.imageR2Key]));
}

// --- 取得（ここから下が外向きの IO） --------------------------------------------------------

// 投稿のレスポンス後に走る本体。1 本が転んでも他は独立に完了する。
// 本数は MAX_LINKS_PER_MEAL（6）で抑えてあるので、並列でも subrequest 予算に収まる（ADR-010 §2）
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
    const key = linkPreviewImageKey(spaceId, mealId, target.id);
    if (await storeImage(bucket, key, snapshot.imageUrl)) imageKey = key;
  }

  // 行は不変なので id だけで名指しできる（URL が貼り替わった編集は、この行を消して
  // 別 id の行を立てる — ADR-010 §1）。消えていれば changes = 0 で何も書かない
  const written = await d1
    .prepare(
      "UPDATE meal_links SET status = ?, title = ?, description = ?, site_name = ?, image_r2_key = ?, fetched_at = ? WHERE id = ? AND meal_id = ?",
    )
    .bind(
      snapshot === null ? "failed" : "ok",
      snapshot?.title ?? null,
      snapshot?.description ?? null,
      snapshot?.siteName ?? null,
      imageKey,
      new Date().toISOString(),
      target.id,
      mealId,
    )
    .run();
  // 取得中に投稿が消えた / URL が貼り替わった。置いたばかりの画像は誰も参照しないので消す
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

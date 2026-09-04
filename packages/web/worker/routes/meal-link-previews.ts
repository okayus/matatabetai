import { drizzle } from "drizzle-orm/d1";
import { Hono, type Context } from "hono";
import { errorBody, errorStatus, parseWith, type AppError } from "../domain/errors";
import { LinkPreviewKind } from "../domain/link-preview";
import { MealId } from "../domain/meal";
import type { SpaceEnv } from "../env";
import { serveR2Object } from "../lib/r2-object";
import { linkPreviewImageKeyOf } from "../meals/link-previews";

function fail(c: Context<SpaceEnv>, error: AppError) {
  return c.json(errorBody(error), errorStatus(error));
}

// /api/spaces/:spaceId/meals/:mealId/link-previews — spaceMiddleware が所属を証明済み。
// og:image は hotlink せず取り込んで private R2（写真と同じ bucket の ogp/ 接頭辞）に置いてあるので、
// 配信は写真とまったく同じ経路: 認可（join で meal + space 一致）を通ってから R2 に触る。
export const mealLinkPreviewRoutes = new Hono<SpaceEnv>().get("/:kind/image", async (c) => {
  const mealId = parseWith(MealId, c.req.param("mealId"));
  const kind = parseWith(LinkPreviewKind, c.req.param("kind"));
  if (mealId.isErr() || kind.isErr()) return fail(c, { type: "not_found" });
  const key = await linkPreviewImageKeyOf(
    drizzle(c.env.DB),
    c.var.spaceId,
    mealId.value,
    kind.value,
  );
  // 行が無い / 画像なしのプレビュー（失敗・og:image 無し）は同じ 404
  if (key === null) return fail(c, { type: "not_found" });

  // 写真と違ってこの URL は kind ごとに固定で、URL を貼り替えると同じ URL の中身が変わる。
  // max-age で寝かせると貼り替えたのに前のサイトの画像が出るので、毎回 ETag で確かめる
  // （ふだんは 304 が返るだけ — ADR-008 §5）
  const res = await serveR2Object(
    c.env.PHOTOS_BUCKET,
    key,
    c.req.raw.headers,
    "image/jpeg",
    "private, no-cache",
  );
  if (res === null) {
    console.error("[link-previews] row without R2 object", key);
    return fail(c, { type: "not_found" });
  }
  return res;
});

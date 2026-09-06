import { drizzle } from "drizzle-orm/d1";
import { Hono, type Context } from "hono";
import { errorBody, errorStatus, parseWith, type AppError } from "../domain/errors";
import { MealId } from "../domain/meal";
import type { SpaceEnv } from "../env";
import { serveR2Object } from "../lib/r2-object";
import { linkImageKeyOf } from "../meals/links";

function fail(c: Context<SpaceEnv>, error: AppError) {
  return c.json(errorBody(error), errorStatus(error));
}

// /api/spaces/:spaceId/meals/:mealId/links — spaceMiddleware が所属を証明済み。
// og:image は hotlink せず取り込んで private R2（写真と同じ bucket の ogp/ 接頭辞）に置いてあるので、
// 配信は写真とまったく同じ経路: 認可（join で meal + space 一致）を通ってから R2 に触る。
export const mealLinkRoutes = new Hono<SpaceEnv>().get("/:linkId/image", async (c) => {
  const mealId = parseWith(MealId, c.req.param("mealId"));
  const linkId = parseWith(MealId, c.req.param("linkId"));
  if (mealId.isErr() || linkId.isErr()) return fail(c, { type: "not_found" });
  const key = await linkImageKeyOf(drizzle(c.env.DB), c.var.spaceId, mealId.value, linkId.value);
  // 行が無い / 画像なしのプレビュー（失敗・og:image 無し）は同じ 404
  if (key === null) return fail(c, { type: "not_found" });

  // この URL は行の id ごとに固有で、行は不変（URL を貼り替える編集は別 id の行を立てる —
  // ADR-010 §1）。同じ URL の中身が後から変わることは無いので寝かせてよい
  // （ADR-008 §5 が毎回 ETag を確かめていた理由がここで消える）
  const res = await serveR2Object(
    c.env.PHOTOS_BUCKET,
    key,
    c.req.raw.headers,
    "image/jpeg",
    "private, max-age=31536000, immutable",
  );
  if (res === null) {
    console.error("[meal-links] row without R2 object", key);
    return fail(c, { type: "not_found" });
  }
  return res;
});

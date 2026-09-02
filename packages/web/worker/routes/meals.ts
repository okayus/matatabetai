import { drizzle } from "drizzle-orm/d1";
import { Hono, type Context } from "hono";
import { errorBody, errorStatus, parseWith, type AppError } from "../domain/errors";
import {
  CreateMealInput,
  MealId,
  MealListQuery,
  MealStatsQuery,
  TagFilterQuery,
  UpdateMataTabetaiInput,
} from "../domain/meal";
import type { SpaceEnv } from "../env";
import { createMeal, deleteMeal, setMataTabetai } from "../meals/commands";
import { aggregateMealNames, listMeals, listSuggestions, type MealSummary } from "../meals/queries";

function fail(c: Context<SpaceEnv>, error: AppError) {
  return c.json(errorBody(error), errorStatus(error));
}

// /api/spaces/:spaceId/meals — spaceMiddleware が所属を証明済み。
// meal を引く文は必ず space_id も比較する（別スペースの meal id を当てても 404）。
export const mealRoutes = new Hono<SpaceEnv>()
  // ?tags=a&tags=b（AND）と ?mataTabetai=1 で絞り込める（requirements 6 / 9 のタグ検索・またたべたい一覧）
  .get("/", async (c) => {
    const q = parseWith(MealListQuery, {
      tags: c.req.queries("tags") ?? [],
      mataTabetai: c.req.query("mataTabetai"),
    });
    if (q.isErr()) return fail(c, q.error);
    return c.json(
      await listMeals(drizzle(c.env.DB), c.var.spaceId, {
        tagNames: q.value.tags,
        mataTabetaiOnly: q.value.mataTabetai,
      }),
    );
  })
  // 投稿フォームのサジェスト。?tags=a&tags=b で AND 絞り込み（:mealId より先に登録する）
  .get("/suggestions", async (c) => {
    const tags = parseWith(TagFilterQuery, c.req.queries("tags") ?? []);
    if (tags.isErr()) return fail(c, tags.error);
    return c.json(await listSuggestions(drizzle(c.env.DB), c.var.spaceId, tags.value));
  })
  // 料理名の期間集計（requirements 7「主要クエリ」）。?from / ?to は任意で両端を含む
  .get("/stats", async (c) => {
    const q = parseWith(MealStatsQuery, { from: c.req.query("from"), to: c.req.query("to") });
    if (q.isErr()) return fail(c, q.error);
    return c.json(await aggregateMealNames(drizzle(c.env.DB), c.var.spaceId, q.value));
  })
  .post("/", async (c) => {
    const parsed = parseWith(CreateMealInput, await c.req.json().catch(() => undefined));
    if (parsed.isErr()) return fail(c, parsed.error);
    const now = new Date().toISOString();
    const created = await createMeal(c.env.DB, c.var.spaceId, c.var.userId, parsed.value, now);
    const body: MealSummary = {
      id: created.id,
      name: parsed.value.name,
      eatenOn: parsed.value.eatenOn,
      mealType: parsed.value.mealType,
      recipeSource: parsed.value.recipeSource,
      note: parsed.value.note,
      mataTabetai: false,
      tags: created.tags,
      photos: [],
      createdBy: c.var.userId,
      createdByName: c.var.displayName,
      createdAt: now,
      updatedAt: now,
    };
    return c.json(body, 201);
  })
  .patch("/:mealId", async (c) => {
    const id = parseWith(MealId, c.req.param("mealId"));
    if (id.isErr()) return fail(c, { type: "not_found" });
    const parsed = parseWith(UpdateMataTabetaiInput, await c.req.json().catch(() => undefined));
    if (parsed.isErr()) return fail(c, parsed.error);
    const now = new Date().toISOString();
    if (!(await setMataTabetai(c.env.DB, c.var.spaceId, id.value, parsed.value.mataTabetai, now))) {
      return fail(c, { type: "not_found" });
    }
    return c.json({ id: id.value, mataTabetai: parsed.value.mataTabetai, updatedAt: now });
  })
  .delete("/:mealId", async (c) => {
    const id = parseWith(MealId, c.req.param("mealId"));
    if (id.isErr()) return fail(c, { type: "not_found" });
    if (!(await deleteMeal(c.env.DB, c.env.PHOTOS_BUCKET, c.var.spaceId, id.value))) {
      return fail(c, { type: "not_found" });
    }
    return c.json({});
  });

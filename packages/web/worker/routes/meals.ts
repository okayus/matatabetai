import { drizzle } from "drizzle-orm/d1";
import { Hono, type Context } from "hono";
import { errorBody, errorStatus, parseWith, type AppError } from "../domain/errors";
import {
  MealContentInput,
  MealId,
  MealListQuery,
  MealStatsQuery,
  TagFilterQuery,
  UpdateMataTabetaiInput,
} from "../domain/meal";
import type { SpaceEnv } from "../env";
import { createMeal, deleteMeal, setMataTabetai, updateMeal } from "../meals/commands";
import { runLinkPreviewJobs } from "../meals/link-previews";
import {
  aggregateMealNames,
  aggregateMealTags,
  getMeal,
  listMeals,
  listSuggestions,
  type MealSummary,
} from "../meals/queries";

function fail(c: Context<SpaceEnv>, error: AppError) {
  return c.json(errorBody(error), errorStatus(error));
}

// /api/spaces/:spaceId/meals — spaceMiddleware が所属を証明済み。
// meal を引く文は必ず space_id も比較する（別スペースの meal id を当てても 404）。
export const mealRoutes = new Hono<SpaceEnv>()
  // ?tags=a&tags=b（AND）・?mataTabetai=1・?q=（料理名の部分一致）で絞り込める
  // （requirements 6 / 9 / 15 のタグ検索・またたべたい一覧・ホームの検索）
  .get("/", async (c) => {
    const q = parseWith(MealListQuery, {
      tags: c.req.queries("tags") ?? [],
      mataTabetai: c.req.query("mataTabetai"),
      q: c.req.query("q"),
    });
    if (q.isErr()) return fail(c, q.error);
    return c.json(
      await listMeals(drizzle(c.env.DB), c.var.spaceId, {
        tagNames: q.value.tags,
        mataTabetaiOnly: q.value.mataTabetai,
        nameQuery: q.value.q,
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
  // 食材タグの期間集計（タグクラウド）。単位が料理名からタグに変わるだけで、期間の読みは /stats と同じ
  .get("/tag-stats", async (c) => {
    const q = parseWith(MealStatsQuery, { from: c.req.query("from"), to: c.req.query("to") });
    if (q.isErr()) return fail(c, q.error);
    return c.json(await aggregateMealTags(drizzle(c.env.DB), c.var.spaceId, q.value));
  })
  .post("/", async (c) => {
    const parsed = parseWith(MealContentInput, await c.req.json().catch(() => undefined));
    if (parsed.isErr()) return fail(c, parsed.error);
    const now = new Date().toISOString();
    const created = await createMeal(c.env.DB, c.var.spaceId, c.var.userId, parsed.value, now);
    // URL プレビューは応答を返した後に取りに行く（ADR-007 §3）。投稿を外部サイトの
    // 応答待ちでブロックしない。取れなければ行は failed のまま = プレーンリンク
    if (created.previewTargets.length > 0) {
      c.executionCtx.waitUntil(
        runLinkPreviewJobs(
          c.env.DB,
          c.env.PHOTOS_BUCKET,
          c.var.spaceId,
          created.id,
          created.previewTargets,
        ),
      );
    }
    const body: MealSummary = {
      id: created.id,
      name: parsed.value.name,
      eatenOn: parsed.value.eatenOn,
      mealType: parsed.value.mealType,
      recipeUrl: parsed.value.recipeUrl,
      shopUrl: parsed.value.shopUrl,
      recipeMemo: parsed.value.recipeMemo,
      note: parsed.value.note,
      mataTabetai: false,
      tags: created.tags,
      photos: [],
      // この時点ではどれも取得中。カードは次に一覧を読んだときに出る
      previews: created.previewTargets.map((t) => ({ kind: t.kind, status: "pending" as const })),
      createdBy: c.var.userId,
      createdByName: c.var.displayName,
      createdAt: now,
      updatedAt: now,
    };
    return c.json(body, 201);
  })
  // 編集は内容の全置き換え（ADR-008 §1）。body は作成と同じ MealContentInput で、
  // またたべたい（PATCH）と写真（子リソース）はここでは動かない。
  // 直せるのはスペースのメンバーなら誰でも — created_by は認可軸ではない（ADR-008 §2）
  .put("/:mealId", async (c) => {
    const id = parseWith(MealId, c.req.param("mealId"));
    if (id.isErr()) return fail(c, { type: "not_found" });
    const parsed = parseWith(MealContentInput, await c.req.json().catch(() => undefined));
    if (parsed.isErr()) return fail(c, parsed.error);
    const now = new Date().toISOString();
    const targets = await updateMeal(
      c.env.DB,
      c.env.PHOTOS_BUCKET,
      c.var.spaceId,
      id.value,
      parsed.value,
      now,
    );
    if (targets === null) return fail(c, { type: "not_found" });
    // 貼り替わった URL だけ取りに行く（同じ URL の行はそのまま — ADR-008 §5）
    if (targets.length > 0) {
      c.executionCtx.waitUntil(
        runLinkPreviewJobs(c.env.DB, c.env.PHOTOS_BUCKET, c.var.spaceId, id.value, targets),
      );
    }
    const meal = await getMeal(drizzle(c.env.DB), c.var.spaceId, id.value);
    // 書いた直後に他の家族が消した。編集の結果は残っていないので「無い」を返す
    if (meal === null) return fail(c, { type: "not_found" });
    return c.json(meal);
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

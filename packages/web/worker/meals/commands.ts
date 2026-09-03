import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { meals, tags } from "../db/schema";
import {
  frozenRecipeColumns,
  normalizeName,
  uniqueTagNames,
  type CreateMealInput,
  type MealId,
} from "../domain/meal";
import type { UserId } from "../domain/auth";
import type { SpaceId } from "../domain/space";
import { photoKeysOfMeal } from "./photos";
import type { MealTagSummary } from "./queries";

// タグの upsert → meal → meal_tags を 1 つの batch（原子的）で書く。tag id の解決は
// INSERT … SELECT で SQL 側に閉じ、同名タグの同時投稿は ON CONFLICT DO NOTHING が吸収する。
export async function createMeal(
  d1: D1Database,
  spaceId: SpaceId,
  userId: UserId,
  input: CreateMealInput,
  now: string,
): Promise<{ id: string; tags: MealTagSummary[] }> {
  const id = crypto.randomUUID();
  const tagNames = uniqueTagNames(input.tags);
  // recipe_source_type / url は凍結列。3 項目とは別に、旧 CHECK を満たす値を導出して書く
  const frozen = frozenRecipeColumns(input.recipeMemo);
  await d1.batch([
    ...tagNames.map((name) =>
      d1
        .prepare(
          "INSERT INTO tags (id, space_id, name, name_normalized, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (space_id, name_normalized) DO NOTHING",
        )
        .bind(crypto.randomUUID(), spaceId, name, normalizeName(name), now),
    ),
    // またたべたい は投稿後のトグルで付ける（作成時は常に 0）
    d1
      .prepare(
        "INSERT INTO meals (id, space_id, name, name_normalized, eaten_on, meal_type, recipe_source_type, url, recipe_url, shop_url, recipe_text, note, mata_tabetai, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)",
      )
      .bind(
        id,
        spaceId,
        input.name,
        normalizeName(input.name),
        input.eatenOn,
        input.mealType,
        frozen.recipeSourceType,
        frozen.url,
        input.recipeUrl,
        input.shopUrl,
        input.recipeMemo,
        input.note,
        userId,
        now,
        now,
      ),
    ...tagNames.map((name) =>
      d1
        .prepare(
          "INSERT INTO meal_tags (meal_id, tag_id) SELECT ?, id FROM tags WHERE space_id = ? AND name_normalized = ?",
        )
        .bind(id, spaceId, normalizeName(name)),
    ),
  ]);
  return { id, tags: await resolveTags(d1, spaceId, tagNames) };
}

// レスポンス用に入力順のまま id を引き直す
async function resolveTags(
  d1: D1Database,
  spaceId: SpaceId,
  tagNames: readonly string[],
): Promise<MealTagSummary[]> {
  if (tagNames.length === 0) return [];
  const keys = tagNames.map(normalizeName);
  const rows = await drizzle(d1)
    .select({ id: tags.id, name: tags.name, nameNormalized: tags.nameNormalized })
    .from(tags)
    .where(and(eq(tags.spaceId, spaceId), inArray(tags.nameNormalized, keys)));
  const byKey = new Map(rows.map((r) => [r.nameNormalized, { id: r.id, name: r.name }]));
  return keys.flatMap((k) => byKey.get(k) ?? []);
}

export async function setMataTabetai(
  d1: D1Database,
  spaceId: SpaceId,
  mealId: MealId,
  value: boolean,
  now: string,
): Promise<boolean> {
  const updated = await drizzle(d1)
    .update(meals)
    .set({ mataTabetai: value, updatedAt: now })
    .where(and(eq(meals.id, mealId), eq(meals.spaceId, spaceId)))
    .returning({ id: meals.id });
  return updated.length > 0;
}

// meal_tags / meal_photos の行は CASCADE で消える。tags はサジェストのために残す。
// R2 object は CASCADE では消えないので、先に key を集めて配列 1 回で消す（R2 が先:
// 逆順だと一時的な R2 障害が消せない orphan object になる。skill cloudflare-r2-private-image-upload）
export async function deleteMeal(
  d1: D1Database,
  bucket: R2Bucket,
  spaceId: SpaceId,
  mealId: MealId,
): Promise<boolean> {
  const keys = await photoKeysOfMeal(drizzle(d1), spaceId, mealId);
  if (keys.length > 0) await bucket.delete(keys);
  const deleted = await drizzle(d1)
    .delete(meals)
    .where(and(eq(meals.id, mealId), eq(meals.spaceId, spaceId)))
    .returning({ id: meals.id });
  return deleted.length > 0;
}

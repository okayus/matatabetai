import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { meals, tags } from "../db/schema";
import {
  linkPreviewTargets,
  planLinkPreviews,
  type LinkPreviewTarget,
} from "../domain/link-preview";
import {
  frozenRecipeColumns,
  normalizeName,
  uniqueTagNames,
  type MealContentInput,
  type MealId,
} from "../domain/meal";
import type { UserId } from "../domain/auth";
import type { SpaceId } from "../domain/space";
import {
  linkPreviewImageKeysOfMeal,
  pendingPreviewStatements,
  savedPreviewsOfMeal,
  stalePreviewStatements,
} from "./link-previews";
import { mealExists, photoKeysOfMeal } from "./photos";
import type { MealTagSummary } from "./queries";

// タグの upsert → meal → meal_tags → プレビューの pending 行 を 1 つの batch（原子的）で書く。
// tag id の解決は INSERT … SELECT で SQL 側に閉じ、同名タグの同時投稿は ON CONFLICT DO NOTHING が
// 吸収する。プレビューの取得そのものは応答後（waitUntil）で、ここでは行を立てるだけ（ADR-007 §4）
export async function createMeal(
  d1: D1Database,
  spaceId: SpaceId,
  userId: UserId,
  input: MealContentInput,
  now: string,
): Promise<{ id: string; tags: MealTagSummary[]; previewTargets: LinkPreviewTarget[] }> {
  const id = crypto.randomUUID();
  const tagNames = uniqueTagNames(input.tags);
  const previewTargets = linkPreviewTargets(input);
  // recipe_source_type / url は凍結列。3 項目とは別に、旧 CHECK を満たす値を導出して書く
  const frozen = frozenRecipeColumns(input.recipeMemo);
  await d1.batch([
    ...tagUpsertStatements(d1, spaceId, tagNames, now),
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
    ...mealTagStatements(d1, spaceId, id, tagNames),
    ...pendingPreviewStatements(d1, id, previewTargets, now),
  ]);
  return { id, tags: await resolveTags(d1, spaceId, tagNames), previewTargets };
}

// タグ名は space 単位で一意。同名タグの同時投稿は ON CONFLICT DO NOTHING が吸収する
function tagUpsertStatements(
  d1: D1Database,
  spaceId: SpaceId,
  tagNames: readonly string[],
  now: string,
): D1PreparedStatement[] {
  return tagNames.map((name) =>
    d1
      .prepare(
        "INSERT INTO tags (id, space_id, name, name_normalized, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (space_id, name_normalized) DO NOTHING",
      )
      .bind(crypto.randomUUID(), spaceId, name, normalizeName(name), now),
  );
}

// tag id の解決を INSERT … SELECT で SQL 側に閉じる（upsert と同じ batch で走るので、
// 直前に立てたばかりの行も引ける）
function mealTagStatements(
  d1: D1Database,
  spaceId: SpaceId,
  mealId: string,
  tagNames: readonly string[],
): D1PreparedStatement[] {
  return tagNames.map((name) =>
    d1
      .prepare(
        "INSERT INTO meal_tags (meal_id, tag_id) SELECT ?, id FROM tags WHERE space_id = ? AND name_normalized = ?",
      )
      .bind(mealId, spaceId, normalizeName(name)),
  );
}

// 編集は内容の全置き換え（ADR-008 §1）。作成と同じ入力を受け、同じ 1 つの batch で
// タグを張り替える。またたべたい・写真・created_by / created_at はここでは動かない。
// meal が無ければ null（別スペースの id を当てても同じ = 404）
export async function updateMeal(
  d1: D1Database,
  bucket: R2Bucket,
  spaceId: SpaceId,
  mealId: MealId,
  input: MealContentInput,
  now: string,
): Promise<LinkPreviewTarget[] | null> {
  const db = drizzle(d1);
  const [exists, saved] = await Promise.all([
    mealExists(db, spaceId, mealId),
    savedPreviewsOfMeal(db, spaceId, mealId),
  ]);
  if (!exists) return null;

  const tagNames = uniqueTagNames(input.tags);
  const plan = planLinkPreviews(saved, input);
  // 凍結列は書き込みのたびに導出する（ADR-007 §2）。作り方メモを消す編集で
  // recipe_source_type = 'text' のまま残すと CHECK 違反で落ちる
  const frozen = frozenRecipeColumns(input.recipeMemo);
  // 捨てるプレビューの画像は R2 が先（ADR-004 §6）。R2 が落ちても行は残るので再試行できる
  if (plan.staleImageKeys.length > 0) await bucket.delete(plan.staleImageKeys);
  await d1.batch([
    ...tagUpsertStatements(d1, spaceId, tagNames, now),
    d1
      .prepare(
        "UPDATE meals SET name = ?, name_normalized = ?, eaten_on = ?, meal_type = ?, recipe_source_type = ?, url = ?, recipe_url = ?, shop_url = ?, recipe_text = ?, note = ?, updated_at = ? WHERE id = ? AND space_id = ?",
      )
      .bind(
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
        now,
        mealId,
        spaceId,
      ),
    // meal_tags は結合行だけで固有の情報を持たないので、差分を取らず張り替える（ADR-008 §3）
    d1.prepare("DELETE FROM meal_tags WHERE meal_id = ?").bind(mealId),
    ...mealTagStatements(d1, spaceId, mealId, tagNames),
    ...stalePreviewStatements(d1, mealId, plan.staleKinds),
    ...pendingPreviewStatements(d1, mealId, plan.targets, now),
  ]);
  return plan.targets;
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

// meal_tags / meal_photos / meal_link_previews の行は CASCADE で消える。tags はサジェストのために残す。
// R2 object は CASCADE では消えないので、先に key を集めて配列 1 回で消す（写真も og:image も同じ
// bucket。R2 が先: 逆順だと一時的な R2 障害が消せない orphan object になる。
// skill cloudflare-r2-private-image-upload）
export async function deleteMeal(
  d1: D1Database,
  bucket: R2Bucket,
  spaceId: SpaceId,
  mealId: MealId,
): Promise<boolean> {
  const db = drizzle(d1);
  const [photoKeys, previewKeys] = await Promise.all([
    photoKeysOfMeal(db, spaceId, mealId),
    linkPreviewImageKeysOfMeal(db, spaceId, mealId),
  ]);
  const keys = [...photoKeys, ...previewKeys];
  if (keys.length > 0) await bucket.delete(keys);
  const deleted = await db
    .delete(meals)
    .where(and(eq(meals.id, mealId), eq(meals.spaceId, spaceId)))
    .returning({ id: meals.id });
  return deleted.length > 0;
}

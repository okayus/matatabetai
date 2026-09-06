import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { meals, tags } from "../db/schema";
import {
  pendingMealLink,
  planLinks,
  plannedLinks,
  type LinkPreviewTarget,
  type MealLink,
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
  addedLinkStatements,
  fetchTargets,
  linkImageKeysOfMeal,
  removedLinkStatements,
  repositionedLinkStatements,
  savedLinksOfMeal,
} from "./links";
import { mealExists, photoKeysOfMeal } from "./photos";
import { loadMealCooks, type MealCookSummary, type MealTagSummary } from "./queries";

// タグの upsert → meal → meal_tags → meal_cooks → リンクの pending 行 を 1 つの batch（原子的）で書く。
// tag id の解決と作った人のメンバー確認は INSERT … SELECT で SQL 側に閉じ、同名タグの同時投稿は
// ON CONFLICT DO NOTHING が吸収する。プレビューの取得そのものは応答後（waitUntil）で、ここでは行を立てるだけ（ADR-007 §4）
export async function createMeal(
  d1: D1Database,
  spaceId: SpaceId,
  userId: UserId,
  input: MealContentInput,
  now: string,
): Promise<{
  id: string;
  tags: MealTagSummary[];
  cooks: MealCookSummary[];
  links: MealLink[];
  previewTargets: LinkPreviewTarget[];
}> {
  const id = crypto.randomUUID();
  const tagNames = uniqueTagNames(input.tags);
  const links = addedLinkStatements(d1, id, plannedLinks(input), now);
  // recipe_source_type / url は凍結列。3 項目とは別に、旧 CHECK を満たす値を導出して書く
  const frozen = frozenRecipeColumns(input.recipeMemo);
  await d1.batch([
    ...tagUpsertStatements(d1, spaceId, tagNames, now),
    // またたべたい は投稿後のトグルで付ける（作成時は常に 0）
    d1
      .prepare(
        "INSERT INTO meals (id, space_id, name, name_normalized, eaten_on, meal_type, recipe_source_type, url, recipe_text, note, mata_tabetai, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)",
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
        input.recipeMemo,
        input.note,
        userId,
        now,
        now,
      ),
    ...mealTagStatements(d1, spaceId, id, tagNames),
    ...mealCookStatements(d1, spaceId, id, input.cookUserIds),
    ...links.statements,
  ]);
  const [resolvedTags, cooks] = await Promise.all([
    resolveTags(d1, spaceId, tagNames),
    resolveCooks(d1, id),
  ]);
  return {
    id,
    tags: resolvedTags,
    cooks,
    links: links.rows.map(pendingMealLink),
    previewTargets: fetchTargets(links.rows),
  };
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

// 作った人を足す文（ADR-012 §3）。「スペースのメンバーだけが作った人になれる」を SQL 側で保証する
// — 他人の user id を送っても SELECT が 0 行なので、行は増えない（tag id の解決と同じ手）。
// 選び直しただけの編集は既にある行に当たるので ON CONFLICT DO NOTHING
function mealCookStatements(
  d1: D1Database,
  spaceId: SpaceId,
  mealId: string,
  userIds: readonly string[],
): D1PreparedStatement[] {
  return userIds.map((userId) =>
    d1
      .prepare(
        "INSERT INTO meal_cooks (meal_id, user_id) SELECT ?, user_id FROM space_members WHERE space_id = ? AND user_id = ? ON CONFLICT (meal_id, user_id) DO NOTHING",
      )
      .bind(mealId, spaceId, userId),
  );
}

// 外された人だけ消す。meal_tags のような張り替え（全部消して入れ直す）にしないのは、
// スペースを抜けた人の行を戻せなくなるから — INSERT はメンバーしか通さないので、
// 消してしまうと「◯◯ が作った」が誰かの無関係な編集で黙って消える（ADR-012 §4）
function removedCookStatements(
  d1: D1Database,
  mealId: string,
  keepUserIds: readonly string[],
): D1PreparedStatement[] {
  if (keepUserIds.length === 0) {
    return [d1.prepare("DELETE FROM meal_cooks WHERE meal_id = ?").bind(mealId)];
  }
  const placeholders = keepUserIds.map(() => "?").join(", ");
  return [
    d1
      .prepare(`DELETE FROM meal_cooks WHERE meal_id = ? AND user_id NOT IN (${placeholders})`)
      .bind(mealId, ...keepUserIds),
  ];
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
    savedLinksOfMeal(db, spaceId, mealId),
  ]);
  if (!exists) return null;

  const tagNames = uniqueTagNames(input.tags);
  const plan = planLinks(saved, input);
  const added = addedLinkStatements(d1, mealId, plan.added, now);
  // 凍結列は書き込みのたびに導出する（ADR-007 §2）。作り方メモを消す編集で
  // recipe_source_type = 'text' のまま残すと CHECK 違反で落ちる
  const frozen = frozenRecipeColumns(input.recipeMemo);
  // 捨てるプレビューの画像は R2 が先（ADR-004 §6）。R2 が落ちても行は残るので再試行できる
  if (plan.staleImageKeys.length > 0) await bucket.delete(plan.staleImageKeys);
  await d1.batch([
    ...tagUpsertStatements(d1, spaceId, tagNames, now),
    d1
      .prepare(
        "UPDATE meals SET name = ?, name_normalized = ?, eaten_on = ?, meal_type = ?, recipe_source_type = ?, url = ?, recipe_text = ?, note = ?, updated_at = ? WHERE id = ? AND space_id = ?",
      )
      .bind(
        input.name,
        normalizeName(input.name),
        input.eatenOn,
        input.mealType,
        frozen.recipeSourceType,
        frozen.url,
        input.recipeMemo,
        input.note,
        now,
        mealId,
        spaceId,
      ),
    // meal_tags は結合行だけで固有の情報を持たないので、差分を取らず張り替える（ADR-008 §3）
    d1.prepare("DELETE FROM meal_tags WHERE meal_id = ?").bind(mealId),
    ...mealTagStatements(d1, spaceId, mealId, tagNames),
    ...removedCookStatements(d1, mealId, input.cookUserIds),
    ...mealCookStatements(d1, spaceId, mealId, input.cookUserIds),
    ...removedLinkStatements(d1, mealId, plan.removedIds),
    ...repositionedLinkStatements(d1, mealId, plan.repositioned),
    ...added.statements,
  ]);
  return fetchTargets(added.rows);
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

// 書けた行をそのまま返す（メンバーでない user id は落ちているので、応答が保存の真実）
async function resolveCooks(d1: D1Database, mealId: string): Promise<MealCookSummary[]> {
  return (await loadMealCooks(drizzle(d1), [mealId])).get(mealId) ?? [];
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

// meal_tags / meal_photos / meal_links の行は CASCADE で消える。tags はサジェストのために残す。
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
    linkImageKeysOfMeal(db, spaceId, mealId),
  ]);
  const keys = [...photoKeys, ...previewKeys];
  if (keys.length > 0) await bucket.delete(keys);
  const deleted = await db
    .delete(meals)
    .where(and(eq(meals.id, mealId), eq(meals.spaceId, spaceId)))
    .returning({ id: meals.id });
  return deleted.length > 0;
}

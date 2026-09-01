import { desc, eq, inArray } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/d1";
import { mealTags, meals, tags, users } from "../db/schema";
import { recipeSourceFromColumns, type MealType, type RecipeSource } from "../domain/meal";

type Db = ReturnType<typeof drizzle>;

export type MealTagSummary = { id: string; name: string };

export type MealSummary = {
  id: string;
  name: string;
  eatenOn: string;
  mealType: MealType | null;
  recipeSource: RecipeSource;
  note: string | null;
  mataTabetai: boolean;
  tags: MealTagSummary[];
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
};

// 直近だけ返す（期間 UI は Phase 3）。D1 の bound parameter 上限に inArray が収まる値にする
export const MEAL_LIST_LIMIT = 50;

export async function listMeals(db: Db, spaceId: string): Promise<MealSummary[]> {
  const rows = await db
    .select({
      id: meals.id,
      name: meals.name,
      eatenOn: meals.eatenOn,
      mealType: meals.mealType,
      recipeSourceType: meals.recipeSourceType,
      url: meals.url,
      recipeText: meals.recipeText,
      note: meals.note,
      mataTabetai: meals.mataTabetai,
      createdBy: meals.createdBy,
      createdByName: users.displayName,
      createdAt: meals.createdAt,
      updatedAt: meals.updatedAt,
    })
    .from(meals)
    .innerJoin(users, eq(meals.createdBy, users.id))
    .where(eq(meals.spaceId, spaceId))
    .orderBy(desc(meals.eatenOn), desc(meals.createdAt))
    .limit(MEAL_LIST_LIMIT);

  const tagsByMeal = await loadMealTags(
    db,
    rows.map((r) => r.id),
  );
  return rows.map(({ recipeSourceType, url, recipeText, ...rest }) => ({
    ...rest,
    recipeSource: recipeSourceFromColumns(recipeSourceType, url, recipeText),
    tags: tagsByMeal.get(rest.id) ?? [],
  }));
}

async function loadMealTags(db: Db, mealIds: string[]): Promise<Map<string, MealTagSummary[]>> {
  const map = new Map<string, MealTagSummary[]>();
  if (mealIds.length === 0) return map;
  const rows = await db
    .select({ mealId: mealTags.mealId, id: tags.id, name: tags.name })
    .from(mealTags)
    .innerJoin(tags, eq(mealTags.tagId, tags.id))
    .where(inArray(mealTags.mealId, mealIds))
    .orderBy(tags.nameNormalized);
  for (const { mealId, id, name } of rows) {
    const list = map.get(mealId) ?? [];
    list.push({ id, name });
    map.set(mealId, list);
  }
  return map;
}

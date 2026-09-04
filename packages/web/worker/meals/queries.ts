import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/d1";
import { mealTags, meals, tags, users } from "../db/schema";
import type { LinkPreview } from "../domain/link-preview";
import { normalizeName, type MealLinks, type MealType } from "../domain/meal";
import { previewsByMealIds } from "./link-previews";
import { photosByMealIds, type MealPhotoSummary } from "./photos";

type Db = ReturnType<typeof drizzle>;

export type MealTagSummary = { id: string; name: string };

// リンク・メモの 3 項目は入力と同じ形で返す（MealLinks — ADR-007 §1）。
// 凍結列 recipe_source_type / url は API に出さない。
// previews は URL がある欄のぶんだけ並ぶ（取得中・失敗も 1 要素として出る — ADR-007 §5）
export type MealSummary = MealLinks & {
  id: string;
  name: string;
  eatenOn: string;
  mealType: MealType | null;
  note: string | null;
  mataTabetai: boolean;
  tags: MealTagSummary[];
  photos: MealPhotoSummary[];
  previews: LinkPreview[];
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
};

// 直近だけ返す（ページングは要件が出てから）。D1 の bound parameter 上限に inArray が収まる値にする
export const MEAL_LIST_LIMIT = 50;

// またたべたい一覧（requirements 9）とタグ検索 AND（requirements 6）は、別リソースではなく
// 同じ一覧の絞り込み。2 つは直交して合成できる（「またたべたいの中からじゃがいもで」）
export type MealListFilter = { tagNames: readonly string[]; mataTabetaiOnly: boolean };

// 一覧・単体で同じ列を返す（表示名は created_by の user 行から引く）
const MEAL_COLUMNS = {
  id: meals.id,
  name: meals.name,
  eatenOn: meals.eatenOn,
  mealType: meals.mealType,
  recipeUrl: meals.recipeUrl,
  shopUrl: meals.shopUrl,
  recipeMemo: meals.recipeMemo,
  note: meals.note,
  mataTabetai: meals.mataTabetai,
  createdBy: meals.createdBy,
  createdByName: users.displayName,
  createdAt: meals.createdAt,
  updatedAt: meals.updatedAt,
} as const;

type MealRow = Omit<MealSummary, "tags" | "photos" | "previews">;

// タグ・写真・プレビューを 1 往復ずつでまとめて足す（行ごとに引かない）
async function withRelations(db: Db, rows: MealRow[]): Promise<MealSummary[]> {
  const ids = rows.map((r) => r.id);
  const [tagsByMeal, photosByMeal, previewsByMeal] = await Promise.all([
    loadMealTags(db, ids),
    photosByMealIds(db, ids),
    previewsByMealIds(db, ids),
  ]);
  return rows.map((row) => ({
    ...row,
    tags: tagsByMeal.get(row.id) ?? [],
    photos: photosByMeal.get(row.id) ?? [],
    previews: previewsByMeal.get(row.id) ?? [],
  }));
}

export async function listMeals(
  db: Db,
  spaceId: string,
  filter: MealListFilter,
): Promise<MealSummary[]> {
  const keys = filter.tagNames.map(normalizeName);
  const rows = await db
    .select(MEAL_COLUMNS)
    .from(meals)
    .innerJoin(users, eq(meals.createdBy, users.id))
    .where(
      and(
        eq(meals.spaceId, spaceId),
        filter.mataTabetaiOnly ? eq(meals.mataTabetai, true) : undefined,
        keys.length === 0 ? undefined : inArray(meals.id, mealIdsWithAllTags(db, spaceId, keys)),
      ),
    )
    .orderBy(desc(meals.eatenOn), desc(meals.createdAt))
    .limit(MEAL_LIST_LIMIT);
  return await withRelations(db, rows);
}

// 編集の応答に使う 1 件版（ADR-008 §1）。一覧と同じ形を返すので、クライアントは
// 行をそのまま差し替えられる。他スペースの id を当てても null = 404
export async function getMeal(
  db: Db,
  spaceId: string,
  mealId: string,
): Promise<MealSummary | null> {
  const rows = await db
    .select(MEAL_COLUMNS)
    .from(meals)
    .innerJoin(users, eq(meals.createdBy, users.id))
    .where(and(eq(meals.id, mealId), eq(meals.spaceId, spaceId)));
  return (await withRelations(db, rows))[0] ?? null;
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

// 投稿フォームのサジェスト（requirements 8）。料理名ごとに直近 1 件を返し、選ぶと
// 前回のリンク 2 種 / 作り方メモ / タグを複製できる。件数は requirements「主要クエリ」の LIMIT 20
export const SUGGESTION_LIMIT = 20;

export type MealSuggestion = MealLinks & {
  // 直近の投稿。写真 URL の組み立てと React の key に使う
  mealId: string;
  name: string;
  lastEatenOn: string;
  // 同じ料理名の投稿のどれか 1 つでも「またたべたい」なら立つ
  mataTabetai: boolean;
  tags: MealTagSummary[];
  photo: { id: string; hasThumb: boolean } | null;
};

// 指定タグを「全部」持つ meal の id（requirements のタグ検索 AND）。
// tags は space 単位で一意なので、tags.space_id で絞れば別スペースの meal は入らない
function mealIdsWithAllTags(db: Db, spaceId: string, keys: string[]) {
  return db
    .select({ mealId: mealTags.mealId })
    .from(mealTags)
    .innerJoin(tags, eq(mealTags.tagId, tags.id))
    .where(and(eq(tags.spaceId, spaceId), inArray(tags.nameNormalized, keys)))
    .groupBy(mealTags.mealId)
    .having(sql`count(distinct ${tags.id}) = ${keys.length}`);
}

// 料理名（name_normalized）ごとに直近 1 件へ畳む。GROUP BY + MAX の bare column は
// 同着のときどの行が来るか決まらないので、row_number() で「最新の 1 行」を名指しする。
// スペース全体を舐めるが、家族規模の行数を前提に index（space_id, eaten_on）だけで足りる
export async function listSuggestions(
  db: Db,
  spaceId: string,
  tagNames: readonly string[],
): Promise<MealSuggestion[]> {
  const keys = tagNames.map(normalizeName);
  const ranked = db.$with("ranked").as(
    db
      .select({
        mealId: meals.id,
        name: meals.name,
        lastEatenOn: meals.eatenOn,
        createdAt: meals.createdAt,
        recipeUrl: meals.recipeUrl,
        shopUrl: meals.shopUrl,
        recipeMemo: meals.recipeMemo,
        rank: sql<number>`row_number() over (partition by ${meals.nameNormalized} order by ${meals.eatenOn} desc, ${meals.createdAt} desc)`.as(
          "rank",
        ),
        everMataTabetai: sql<number>`max(${meals.mataTabetai}) over (partition by ${meals.nameNormalized})`.as(
          "ever_mata_tabetai",
        ),
      })
      .from(meals)
      .where(
        and(
          eq(meals.spaceId, spaceId),
          keys.length === 0 ? undefined : inArray(meals.id, mealIdsWithAllTags(db, spaceId, keys)),
        ),
      ),
  );

  const rows = await db
    .with(ranked)
    .select({
      mealId: ranked.mealId,
      name: ranked.name,
      lastEatenOn: ranked.lastEatenOn,
      recipeUrl: ranked.recipeUrl,
      shopUrl: ranked.shopUrl,
      recipeMemo: ranked.recipeMemo,
      everMataTabetai: ranked.everMataTabetai,
    })
    .from(ranked)
    .where(eq(ranked.rank, 1))
    .orderBy(desc(ranked.lastEatenOn), desc(ranked.createdAt))
    .limit(SUGGESTION_LIMIT);

  const ids = rows.map((r) => r.mealId);
  const [tagsByMeal, photosByMeal] = await Promise.all([
    loadMealTags(db, ids),
    photosByMealIds(db, ids),
  ]);
  return rows.map(({ everMataTabetai, ...rest }) => {
    const first = photosByMeal.get(rest.mealId)?.[0];
    return {
      ...rest,
      mataTabetai: everMataTabetai > 0,
      tags: tagsByMeal.get(rest.mealId) ?? [],
      photo: first ? { id: first.id, hasThumb: first.hasThumb } : null,
    };
  });
}

// 料理名の期間集計（requirements 7「主要クエリ」）。GROUP BY name_normalized 相当を window で
// 書き、表示名と最終日は rank = 1（その名前の直近 1 件）から拾う — bare column の非決定を避ける
// 理由・形とも listSuggestions と同じ（ADR-005 §2）。並びは回数の多い順、同数は直近が先。
// ♥ は期間内のどれかに付いていれば立てる（要件 9「集計で前に出す」は並びではなく印で満たす）
export const MEAL_STATS_LIMIT = 100;

export type MealNameStat = {
  name: string;
  count: number;
  lastEatenOn: string;
  mataTabetai: boolean;
};

export async function aggregateMealNames(
  db: Db,
  spaceId: string,
  range: { from?: string | undefined; to?: string | undefined },
): Promise<MealNameStat[]> {
  const ranked = db.$with("ranked").as(
    db
      .select({
        name: meals.name,
        nameNormalized: meals.nameNormalized,
        lastEatenOn: meals.eatenOn,
        rank: sql<number>`row_number() over (partition by ${meals.nameNormalized} order by ${meals.eatenOn} desc, ${meals.createdAt} desc)`.as(
          "rank",
        ),
        count: sql<number>`count(*) over (partition by ${meals.nameNormalized})`.as("count"),
        everMataTabetai: sql<number>`max(${meals.mataTabetai}) over (partition by ${meals.nameNormalized})`.as(
          "ever_mata_tabetai",
        ),
      })
      .from(meals)
      .where(
        and(
          eq(meals.spaceId, spaceId),
          range.from === undefined ? undefined : gte(meals.eatenOn, range.from),
          range.to === undefined ? undefined : lte(meals.eatenOn, range.to),
        ),
      ),
  );

  const rows = await db
    .with(ranked)
    .select({
      name: ranked.name,
      lastEatenOn: ranked.lastEatenOn,
      count: ranked.count,
      everMataTabetai: ranked.everMataTabetai,
    })
    .from(ranked)
    .where(eq(ranked.rank, 1))
    .orderBy(desc(ranked.count), desc(ranked.lastEatenOn), asc(ranked.nameNormalized))
    .limit(MEAL_STATS_LIMIT);
  return rows.map(({ everMataTabetai, ...rest }) => ({ ...rest, mataTabetai: everMataTabetai > 0 }));
}

// 食材タグの期間集計（タグクラウド）。料理名の集計と同じ期間・同じ並びの規則で、
// 単位だけが meals から meal_tags に変わる。表示名は group by しているタグ行そのものの列なので
// bare column の非決定は起きない（ADR-005 §2 の心配は「同着の別行から拾う」形にだけ当てはまる）。
// 大きさは回数で決まるので、クラウドに載らない裾は 40 件で切る
export const TAG_STATS_LIMIT = 40;

export type MealTagStat = { id: string; name: string; count: number };

export async function aggregateMealTags(
  db: Db,
  spaceId: string,
  range: { from?: string | undefined; to?: string | undefined },
): Promise<MealTagStat[]> {
  return db
    .select({ id: tags.id, name: tags.name, count: sql<number>`count(*)`.as("count") })
    .from(mealTags)
    .innerJoin(tags, eq(mealTags.tagId, tags.id))
    .innerJoin(meals, eq(mealTags.mealId, meals.id))
    .where(
      and(
        eq(meals.spaceId, spaceId),
        range.from === undefined ? undefined : gte(meals.eatenOn, range.from),
        range.to === undefined ? undefined : lte(meals.eatenOn, range.to),
      ),
    )
    .groupBy(tags.id)
    .orderBy(sql`count(*) desc`, asc(tags.nameNormalized))
    .limit(TAG_STATS_LIMIT);
}

// サジェストの絞り込み候補。よく使う順に返す（家族が最初に触るタグを前に出す）。
// 親 meal を消した後も tags 行は残るので、meal_tags と inner join して使われているものだけ出す
export const TAG_LIST_LIMIT = 50;

export async function listSpaceTags(db: Db, spaceId: string): Promise<MealTagSummary[]> {
  return db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .innerJoin(mealTags, eq(mealTags.tagId, tags.id))
    .where(eq(tags.spaceId, spaceId))
    .groupBy(tags.id)
    .orderBy(sql`count(${mealTags.mealId}) desc`, asc(tags.nameNormalized))
    .limit(TAG_LIST_LIMIT);
}

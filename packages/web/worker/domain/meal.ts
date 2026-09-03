import { z } from "zod";

export type MealId = string & { readonly __brand: unique symbol };
export const MealId = z.uuid().transform((v) => v as MealId);

export type TagId = string & { readonly __brand: unique symbol };
export const TagId = z.uuid().transform((v) => v as TagId);

// 集計・サジェスト・タグ一意性はこの正規形で比べる。表示は入力そのまま（requirements.md）。
// NFKC が全角スペース U+3000 も半角にするので、trim は NFKC の後
export function normalizeName(s: string): string {
  return s.normalize("NFKC").trim().toLowerCase();
}

export type MealName = string & { readonly __brand: unique symbol };
export const MealName = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[^\p{Cc}]*$/u, "制御文字は使えません")
  .transform((v) => v as MealName);

export type TagName = string & { readonly __brand: unique symbol };
export const TagName = z
  .string()
  .trim()
  .min(1)
  .max(30)
  .regex(/^[^\p{Cc}]*$/u, "制御文字は使えません")
  .transform((v) => v as TagName);

// JST の日付文字列。時刻もタイムゾーンも持たない（requirements.md）
export type EatenOn = string & { readonly __brand: unique symbol };
export const EatenOn = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD で指定してください")
  .refine(isCalendarDate, "存在しない日付です")
  .transform((v) => v as EatenOn);

function isCalendarDate(s: string): boolean {
  const [y = 0, m = 0, d = 0] = s.split("-").map(Number);
  if (y < 1900 || y > 2999) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export const MealType = z.enum(["breakfast", "lunch", "dinner", "snack"]);
export type MealType = z.output<typeof MealType>;

// UI に <a href> で出すので http(s) 以外（javascript: 等)は型の段階で落とす
export function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// ひとことメモ・作り方メモは改行を許す（\n \r \t 以外の制御文字は不可）
const multiline = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .regex(/^[\P{Cc}\n\r\t]*$/u, "使えない文字が含まれています");

// 空文字・空白だけの入力は「なし」に畳む（DeviceNameField と同じ規則）
const optionalText = (max: number) =>
  multiline(max)
    .nullish()
    .transform((v) => (v ? v : null));

// 任意の URL 欄。値があるときだけ http(s) を要求する
const optionalUrl = z
  .string()
  .trim()
  .max(2048)
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || isHttpUrl(v), "http(s) の URL を指定してください");

// レシピ URL / お店・商品 URL / 作り方メモ は独立した任意の 3 項目（ADR-007 §1）。
// 排他ではないので DU にしない — 「レシピを見つつ自分のアレンジも書く」が実際の記録の形。
// note（その回のエピソード）は 3 項目とは別物で、サジェストの引き継ぎ対象にも入らない
export type MealLinks = {
  recipeUrl: string | null;
  shopUrl: string | null;
  recipeMemo: string | null;
};

// 旧 RecipeSource の CHECK（meals_recipe_source_check）は table rebuild を避けて凍結したまま
// なので、書き込みのたびに CHECK を満たす値を導出する（ADR-007 §2）。
// url は常に NULL（リンクは recipe_url / shop_url が持つ）、type は作り方メモの有無だけで決まる
export type FrozenRecipeColumns = { recipeSourceType: "text" | "none"; url: null };

export function frozenRecipeColumns(recipeMemo: string | null): FrozenRecipeColumns {
  return { recipeSourceType: recipeMemo === null ? "none" : "text", url: null };
}

// 正規形で重複を除く。表示名は最初に現れた表記が勝つ
export function uniqueTagNames(names: readonly TagName[]): TagName[] {
  const seen = new Set<string>();
  const out: TagName[] = [];
  for (const name of names) {
    const key = normalizeName(name);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

const nullableField = <S extends z.ZodType>(schema: S) =>
  schema.nullish().transform((v) => v ?? null);

export const CreateMealInput = z.object({
  name: MealName,
  eatenOn: EatenOn,
  mealType: nullableField(MealType),
  recipeUrl: optionalUrl,
  shopUrl: optionalUrl,
  recipeMemo: optionalText(5000),
  note: optionalText(1000),
  tags: z.array(TagName).max(20).default([]),
});
export type CreateMealInput = z.output<typeof CreateMealInput>;

export const UpdateMataTabetaiInput = z.object({ mataTabetai: z.boolean() });

// タグ絞り込み（AND）。?tags=a&tags=b の繰り返しで受け取り、正規形で重複を畳む。
// サジェストと一覧のタグ検索で同じ語彙・同じ意味（requirements 6 / 8）
export const TagFilterQuery = z.array(TagName).max(10).transform(uniqueTagNames);

// 一覧のフィルタ（requirements 6 / 9）。またたべたいは「絞るか絞らないか」の一択なので
// 値は "1" だけを受け、他の値は入力ミスとして弾く
export const MealListQuery = z.object({
  tags: TagFilterQuery,
  mataTabetai: z
    .literal("1")
    .optional()
    .transform((v) => v !== undefined),
});
export type MealListQuery = z.output<typeof MealListQuery>;

// 料理名の期間集計（requirements 7）。from / to は任意で、両端を含む（BETWEEN と同じ読み）
export const MealStatsQuery = z
  .object({ from: EatenOn.optional(), to: EatenOn.optional() })
  .refine((r) => r.from === undefined || r.to === undefined || r.from <= r.to, {
    error: "「いつから」は「いつまで」より前の日付にしてください",
    path: ["from"],
  });
export type MealStatsQuery = z.output<typeof MealStatsQuery>;

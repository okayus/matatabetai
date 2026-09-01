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

const RecipeUrl = z.string().trim().max(2048).refine(isHttpUrl, "http(s) の URL を指定してください");

// メモ・自作レシピは改行を許す（\n \r \t 以外の制御文字は不可）
const multiline = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .regex(/^[\P{Cc}\n\r\t]*$/u, "使えない文字が含まれています");

// レシピの出所は URL / 自由テキスト / なし のいずれか（CLAUDE.md の RecipeSource）
export const RecipeSource = z.discriminatedUnion("type", [
  z.object({ type: z.literal("url"), url: RecipeUrl }),
  z.object({ type: z.literal("text"), text: multiline(5000).min(1) }),
  z.object({ type: z.literal("none") }),
]);
export type RecipeSource = z.output<typeof RecipeSource>;

export type RecipeSourceColumns = {
  recipeSourceType: RecipeSource["type"];
  url: string | null;
  recipeText: string | null;
};

// DU ⇔ 平坦化した 3 列（DB の meals_recipe_source_check と同じ対応）
export function recipeSourceToColumns(rs: RecipeSource): RecipeSourceColumns {
  switch (rs.type) {
    case "url":
      return { recipeSourceType: "url", url: rs.url, recipeText: null };
    case "text":
      return { recipeSourceType: "text", url: null, recipeText: rs.text };
    case "none":
      return { recipeSourceType: "none", url: null, recipeText: null };
  }
}

// 行 → DU。CHECK 制約があるので不整合行は来ないはずだが、総関数にして none に落とす
export function recipeSourceFromColumns(
  type: string,
  url: string | null,
  recipeText: string | null,
): RecipeSource {
  if (type === "url" && url !== null) return { type: "url", url };
  if (type === "text" && recipeText !== null) return { type: "text", text: recipeText };
  return { type: "none" };
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
  recipeSource: RecipeSource,
  // 空文字は「なし」（DeviceNameField と同じ規則）
  note: multiline(1000)
    .nullish()
    .transform((v) => (v ? v : null)),
  tags: z.array(TagName).max(20).default([]),
});
export type CreateMealInput = z.output<typeof CreateMealInput>;

export const UpdateMataTabetaiInput = z.object({ mataTabetai: z.boolean() });

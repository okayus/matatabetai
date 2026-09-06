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

// 1 投稿に貼れる URL の本数（レシピ + お店・商品 の合計 — ADR-010 §2）。
// Workers Free の外部 subrequest は 50 / invocation で、1 本の取得は最悪 8
// （ページ + リダイレクト 3 hop + og:image）。6 本なら予算に収まる
export const MAX_LINKS_PER_MEAL = 6;

// URL 欄の並び。空欄（フォームは常に空の 1 行を残す）は落とし、同じ URL は 1 本に畳む。
// http(s) 以外を弾くのは UI に <a href> で出すため（javascript: 等を型の段階で落とす）
const urlList = z
  .array(z.string().trim().max(2048))
  .max(MAX_LINKS_PER_MEAL)
  .nullish()
  .transform((list) => uniqueUrls(list ?? []))
  .refine((list) => list.every(isHttpUrl), "http(s) の URL を指定してください");

// 同じ kind の中の重複を落とす（同じページを 2 回取りに行き、同じカードを 2 枚並べる意味がない）。
// 表記が 1 文字でも違えば別の URL として扱う — 正規化して同一視すると、貼った文字列と
// 表示が食い違う（ADR-010 §5）
export function uniqueUrls(urls: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    if (url === "" || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

// レシピ URL（複数）/ お店・商品 URL（複数）/ 作り方メモ は独立した任意の 3 項目
// （ADR-007 §1、複数化は ADR-010 §1）。排他ではないので DU にしない —
// 「レシピを見つつ自分のアレンジも書く」が実際の記録の形。
// note（その回のエピソード）は 3 項目とは別物で、サジェストの引き継ぎ対象にも入らない
export type MealLinks = {
  recipeUrls: string[];
  shopUrls: string[];
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

// 記録の内容そのもの。作成と編集で同じ入力を使う（編集は部分更新ではなく全置き換え — ADR-008 §1）。
// またたべたい（家族の反応）と写真（子リソース）はこの外側にあり、この型には入らない
export const MealContentInput = z
  .object({
    name: MealName,
    eatenOn: EatenOn,
    mealType: nullableField(MealType),
    recipeUrls: urlList,
    shopUrls: urlList,
    recipeMemo: optionalText(5000),
    note: optionalText(1000),
    tags: z.array(TagName).max(20).default([]),
  })
  // 上限は kind ごとではなく合計で数える（ADR-010 §2）。両方を上限まで埋めたときに
  // 取得の予算を超えないのが上限の意味なので、片方だけ見ても足りない
  .refine((v) => v.recipeUrls.length + v.shopUrls.length <= MAX_LINKS_PER_MEAL, {
    error: `URL はレシピとお店・商品を合わせて ${MAX_LINKS_PER_MEAL} 本までです`,
    path: ["recipeUrls"],
  });
export type MealContentInput = z.output<typeof MealContentInput>;

export const UpdateMataTabetaiInput = z.object({ mataTabetai: z.boolean() });

// タグ絞り込み（AND）。?tags=a&tags=b の繰り返しで受け取り、正規形で重複を畳む。
// サジェストと一覧のタグ検索で同じ語彙・同じ意味（requirements 6 / 8）
export const TagFilterQuery = z.array(TagName).max(10).transform(uniqueTagNames);

// 料理名の部分一致（requirements「主要クエリ」の LIKE、ADR-009 §1）。空・空白だけは「絞らない」
const MealNameQuery = z
  .string()
  .trim()
  .max(100)
  .regex(/^[^\p{Cc}]*$/u, "制御文字は使えません")
  .optional()
  .transform((v) => (v ? v : undefined));

// 一覧のフィルタ（requirements 6 / 9 / 15）。またたべたいは「絞るか絞らないか」の一択なので
// 値は "1" だけを受け、他の値は入力ミスとして弾く
export const MealListQuery = z.object({
  tags: TagFilterQuery,
  mataTabetai: z
    .literal("1")
    .optional()
    .transform((v) => v !== undefined),
  q: MealNameQuery,
});
export type MealListQuery = z.output<typeof MealListQuery>;

// `LIKE '%…%' ESCAPE '\'` の右辺。利用者の入力に混ざった % _ \ をワイルドカードにしない
export function likePattern(needle: string): string {
  return `%${needle.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

// 料理名の期間集計（requirements 7）。from / to は任意で、両端を含む（BETWEEN と同じ読み）
export const MealStatsQuery = z
  .object({ from: EatenOn.optional(), to: EatenOn.optional() })
  .refine((r) => r.from === undefined || r.to === undefined || r.from <= r.to, {
    error: "「いつから」は「いつまで」より前の日付にしてください",
    path: ["from"],
  });
export type MealStatsQuery = z.output<typeof MealStatsQuery>;

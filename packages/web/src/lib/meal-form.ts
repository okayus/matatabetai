import type { Meal, MealContentBody, MealSuggestion, MealTag, MealType } from "../api";

// 投稿フォームの入力状態。DOM ではなくこの値が唯一の出所（サジェストが上書きするので
// 非制御のままでは引き継ぎができない）。送信直前に MealContentBody へ畳む
export type MealFormState = {
  name: string;
  eatenOn: string;
  mealType: string;
  tags: string;
  // 独立した 3 項目（併用可 — ADR-007 §1）。URL は複数貼れる（ADR-010 §1）ので欄の並びを持つ。
  // 空欄は「なし」で、送信直前に落とす（サーバーも同じ規則で畳む）
  recipeUrls: string[];
  shopUrls: string[];
  recipeMemo: string;
  note: string;
  // 作った人（requirements 17、ADR-012）。札のトグルで選ぶ user id の並び。
  // 空 = 「作った人は記録していない」で、初期値も空（自分を既定で選ばない — ADR-012 §6）
  cookUserIds: string[];
};

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const satisfies readonly MealType[];

export const MEAL_TYPE_LABEL: Record<MealType, string> = {
  breakfast: "朝",
  lunch: "昼",
  dinner: "夜",
  snack: "間食",
};

// <select> の値は string。知らない値は「指定なし」に落とす（enum の正典はサーバーの zod）
export function toMealType(value: string): MealType | null {
  return MEAL_TYPES.find((t) => t === value) ?? null;
}

// URL 欄は常に 1 行以上ある — 0 行だと「追加」を押さないと 1 本目が入れられない（ADR-010 §6）
export function urlRows(urls: readonly string[]): string[] {
  return urls.length === 0 ? [""] : [...urls];
}

export function emptyMealForm(today: string): MealFormState {
  return {
    name: "",
    eatenOn: today,
    mealType: "",
    tags: "",
    recipeUrls: [""],
    shopUrls: [""],
    recipeMemo: "",
    note: "",
    cookUserIds: [],
  };
}

// 1 行のときは番号を付けない（読み上げ名。同じ名前の入力が並ぶと、どれを指しているか
// 読み上げから分からない — ADR-010 §6）
export function urlFieldLabel(base: string, index: number, count: number): string {
  return count === 1 ? base : `${base} ${index + 1}`;
}

// 欄の足し引き。値の配列そのものが状態なので、行の増減はここだけで完結する
export function addUrlRow(urls: readonly string[]): string[] {
  return [...urlRows(urls), ""];
}

export function setUrlRow(urls: readonly string[], index: number, value: string): string[] {
  return urlRows(urls).map((url, i) => (i === index ? value : url));
}

export function removeUrlRow(urls: readonly string[], index: number): string[] {
  return urlRows(urlRows(urls).filter((_, i) => i !== index));
}

// 1 投稿に貼れる URL の本数（レシピ + お店・商品 の合計）。サーバーの MAX_LINKS_PER_MEAL と同じ値で、
// フォームは上限に達したら「追加」を無効にする（送ってから断られない — ADR-010 §2）
export const MAX_LINKS_PER_MEAL = 6;

// タグ入力は空白・読点・カンマ区切り（全角スペース U+3000 も \s に入る）
export function parseTagInput(input: string): string[] {
  return input.split(/[、,\s]+/u).filter(Boolean);
}

export function formatTagInput(tags: readonly MealTag[]): string {
  return tags.map((t) => t.name).join(" ");
}

// サジェストを選んだときに引き継ぐのは 料理名 / リンク 2 種・作り方メモ / タグ（requirements 8）。
// 3 項目は料理の属性なので引き継ぎ、食べた日・タイミングは今回の食事のもの、
// メモはその回のエピソードなので引き継がない（ADR-007 §1）。
// 作った人も引き継がない — 同じ料理でも作る人は回ごとに変わる（ADR-012 §5）
export function applySuggestion(form: MealFormState, suggestion: MealSuggestion): MealFormState {
  return {
    ...form,
    name: suggestion.name,
    tags: formatTagInput(suggestion.tags),
    recipeUrls: urlRows(suggestion.recipeUrls),
    shopUrls: urlRows(suggestion.shopUrls),
    recipeMemo: suggestion.recipeMemo ?? "",
  };
}

// 編集フォームの初期値（ADR-008 §7）。サジェストの引き継ぎと違い、その回のものも含めて
// 記録の全部を写す — 直すのは「この記録そのもの」で、複製ではないから
export function mealFormFrom(meal: Meal): MealFormState {
  return {
    name: meal.name,
    eatenOn: meal.eatenOn,
    mealType: meal.mealType ?? "",
    tags: formatTagInput(meal.tags),
    recipeUrls: urlRows(meal.links.flatMap((l) => (l.kind === "recipe" ? [l.url] : []))),
    shopUrls: urlRows(meal.links.flatMap((l) => (l.kind === "shop" ? [l.url] : []))),
    recipeMemo: meal.recipeMemo ?? "",
    note: meal.note ?? "",
    cookUserIds: meal.cooks.map((c) => c.userId),
  };
}

function trimUrls(urls: readonly string[]): string[] {
  return urls.map((u) => u.trim()).filter((u) => u !== "");
}

export function toMealContentBody(form: MealFormState): MealContentBody {
  return {
    name: form.name.trim(),
    eatenOn: form.eatenOn,
    mealType: toMealType(form.mealType),
    // 空欄は落とす（サーバーも同じ規則。フォームは常に空の 1 行を残す）
    recipeUrls: trimUrls(form.recipeUrls),
    shopUrls: trimUrls(form.shopUrls),
    recipeMemo: form.recipeMemo.trim() || null,
    note: form.note.trim() || null,
    tags: parseTagInput(form.tags),
    cookUserIds: form.cookUserIds,
  };
}

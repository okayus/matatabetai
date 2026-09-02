import type { CreateMealBody, MealSuggestion, MealTag, MealType, RecipeSource } from "../api";

// 投稿フォームの入力状態。DOM ではなくこの値が唯一の出所（サジェストが上書きするので
// 非制御のままでは引き継ぎができない）。送信直前に CreateMealBody へ畳む
export type MealFormState = {
  name: string;
  eatenOn: string;
  mealType: string;
  tags: string;
  sourceKind: RecipeSource["type"];
  url: string;
  recipeText: string;
  note: string;
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

export const SOURCE_KINDS = ["none", "url", "text"] as const satisfies readonly RecipeSource["type"][];

// レシピの出所の選択。知らない値は「なし」（DU の正典はサーバーの zod）
export function toSourceKind(value: string): RecipeSource["type"] {
  return SOURCE_KINDS.find((k) => k === value) ?? "none";
}

export function emptyMealForm(today: string): MealFormState {
  return {
    name: "",
    eatenOn: today,
    mealType: "",
    tags: "",
    sourceKind: "none",
    url: "",
    recipeText: "",
    note: "",
  };
}

// タグ入力は空白・読点・カンマ区切り（全角スペース U+3000 も \s に入る）
export function parseTagInput(input: string): string[] {
  return input.split(/[、,\s]+/u).filter(Boolean);
}

export function formatTagInput(tags: readonly MealTag[]): string {
  return tags.map((t) => t.name).join(" ");
}

// サジェストを選んだときに引き継ぐのは 料理名 / URL・レシピ / タグ だけ（requirements 8）。
// 食べた日・タイミングは今回の食事のもの、メモはその回のエピソードなので引き継がない
export function applySuggestion(form: MealFormState, suggestion: MealSuggestion): MealFormState {
  const { recipeSource } = suggestion;
  return {
    ...form,
    name: suggestion.name,
    tags: formatTagInput(suggestion.tags),
    sourceKind: recipeSource.type,
    url: recipeSource.type === "url" ? recipeSource.url : "",
    recipeText: recipeSource.type === "text" ? recipeSource.text : "",
  };
}

function toRecipeSource(form: MealFormState): RecipeSource {
  switch (form.sourceKind) {
    case "url":
      return { type: "url", url: form.url.trim() };
    case "text":
      return { type: "text", text: form.recipeText.trim() };
    case "none":
      return { type: "none" };
  }
}

export function toCreateMealBody(form: MealFormState): CreateMealBody {
  return {
    name: form.name.trim(),
    eatenOn: form.eatenOn,
    mealType: toMealType(form.mealType),
    recipeSource: toRecipeSource(form),
    // 空文字は「なし」（サーバーの nullable と揃える）
    note: form.note.trim() || null,
    tags: parseTagInput(form.tags),
  };
}

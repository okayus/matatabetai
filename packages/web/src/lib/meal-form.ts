import type { MealContentBody, MealSuggestion, MealTag, MealType } from "../api";

// 投稿フォームの入力状態。DOM ではなくこの値が唯一の出所（サジェストが上書きするので
// 非制御のままでは引き継ぎができない）。送信直前に MealContentBody へ畳む
export type MealFormState = {
  name: string;
  eatenOn: string;
  mealType: string;
  tags: string;
  // 独立した 3 項目（併用可 — ADR-007 §1）。空文字は「なし」で、送信直前に null へ畳む
  recipeUrl: string;
  shopUrl: string;
  recipeMemo: string;
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

export function emptyMealForm(today: string): MealFormState {
  return {
    name: "",
    eatenOn: today,
    mealType: "",
    tags: "",
    recipeUrl: "",
    shopUrl: "",
    recipeMemo: "",
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

// サジェストを選んだときに引き継ぐのは 料理名 / リンク 2 種・作り方メモ / タグ（requirements 8）。
// 3 項目は料理の属性なので引き継ぎ、食べた日・タイミングは今回の食事のもの、
// メモはその回のエピソードなので引き継がない（ADR-007 §1）
export function applySuggestion(form: MealFormState, suggestion: MealSuggestion): MealFormState {
  return {
    ...form,
    name: suggestion.name,
    tags: formatTagInput(suggestion.tags),
    recipeUrl: suggestion.recipeUrl ?? "",
    shopUrl: suggestion.shopUrl ?? "",
    recipeMemo: suggestion.recipeMemo ?? "",
  };
}

export function toMealContentBody(form: MealFormState): MealContentBody {
  return {
    name: form.name.trim(),
    eatenOn: form.eatenOn,
    mealType: toMealType(form.mealType),
    // 空文字は「なし」（サーバーの nullable と揃える）
    recipeUrl: form.recipeUrl.trim() || null,
    shopUrl: form.shopUrl.trim() || null,
    recipeMemo: form.recipeMemo.trim() || null,
    note: form.note.trim() || null,
    tags: parseTagInput(form.tags),
  };
}

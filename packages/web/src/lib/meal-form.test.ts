import { describe, expect, it } from "vitest";
import type { MealSuggestion } from "../api";
import {
  applySuggestion,
  emptyMealForm,
  formatTagInput,
  parseTagInput,
  toCreateMealBody,
  toMealType,
  toSourceKind,
  type MealFormState,
} from "./meal-form";

const filled: MealFormState = {
  name: " 肉じゃが ",
  eatenOn: "2026-09-02",
  mealType: "dinner",
  tags: "じゃがいも 牛肉",
  sourceKind: "none",
  url: "",
  recipeText: "",
  note: " おかわりした ",
};

const suggestion = (over: Partial<MealSuggestion> = {}): MealSuggestion => ({
  mealId: "m1",
  name: "肉じゃが",
  lastEatenOn: "2026-08-28",
  mataTabetai: true,
  recipeSource: { type: "none" },
  tags: [],
  photo: null,
  ...over,
});

describe("parseTagInput", () => {
  it("空白・読点・カンマのどれで区切ってもタグになる", () => {
    expect(parseTagInput("じゃがいも 牛肉、玉ねぎ,にんじん")).toEqual([
      "じゃがいも",
      "牛肉",
      "玉ねぎ",
      "にんじん",
    ]);
  });

  it("全角スペースと連続した区切りは空のタグを作らない", () => {
    expect(parseTagInput("　 じゃがいも、、 牛肉 　")).toEqual(["じゃがいも", "牛肉"]);
  });

  it("入力が空ならタグなし", () => {
    expect(parseTagInput("   ")).toEqual([]);
  });
});

describe("toMealType", () => {
  it("知っている値だけ通す", () => {
    expect(toMealType("dinner")).toBe("dinner");
  });

  it("空文字も知らない値も「指定なし」", () => {
    expect(toMealType("")).toBeNull();
    expect(toMealType("midnight")).toBeNull();
  });
});

describe("toSourceKind", () => {
  it("知っている選択肢だけ通し、それ以外は「なし」にする", () => {
    expect(toSourceKind("url")).toBe("url");
    expect(toSourceKind("text")).toBe("text");
    expect(toSourceKind("")).toBe("none");
    expect(toSourceKind("ogp")).toBe("none");
  });
});

describe("toCreateMealBody", () => {
  it("前後の空白を落とし、空のメモは null にする", () => {
    const body = toCreateMealBody(filled);
    expect(body.name).toBe("肉じゃが");
    expect(body.note).toBe("おかわりした");
    expect(toCreateMealBody({ ...filled, note: "  " }).note).toBeNull();
  });

  it("レシピの出所は sourceKind が決める（選んでいない側の入力は載らない）", () => {
    const form = { ...filled, sourceKind: "url" as const, url: " https://example.com/a ", recipeText: "書きかけ" };
    expect(toCreateMealBody(form).recipeSource).toEqual({ type: "url", url: "https://example.com/a" });
    expect(toCreateMealBody({ ...form, sourceKind: "text" }).recipeSource).toEqual({
      type: "text",
      text: "書きかけ",
    });
    expect(toCreateMealBody({ ...form, sourceKind: "none" }).recipeSource).toEqual({ type: "none" });
  });
});

describe("applySuggestion", () => {
  it("料理名・タグ・リンクを引き継ぐ", () => {
    const form = applySuggestion(emptyMealForm("2026-09-02"), suggestion({
      recipeSource: { type: "url", url: "https://example.com/recipe" },
      tags: [
        { id: "t1", name: "じゃがいも" },
        { id: "t2", name: "牛肉" },
      ],
    }));
    expect(form.name).toBe("肉じゃが");
    expect(form.tags).toBe("じゃがいも 牛肉");
    expect(form.sourceKind).toBe("url");
    expect(form.url).toBe("https://example.com/recipe");
  });

  it("食べた日・タイミング・メモは今回の食事のものなので引き継がない", () => {
    const form = applySuggestion(filled, suggestion());
    expect(form.eatenOn).toBe("2026-09-02");
    expect(form.mealType).toBe("dinner");
    expect(form.note).toBe(" おかわりした ");
  });

  it("前回のリンクを選び直したら、書きかけの逆側は残さない", () => {
    const before = { ...filled, sourceKind: "text" as const, recipeText: "前の自作レシピ", url: "https://old.example" };
    const after = applySuggestion(before, suggestion({ recipeSource: { type: "none" } }));
    expect(after.sourceKind).toBe("none");
    expect(after.recipeText).toBe("");
    expect(after.url).toBe("");
  });

  it("タグの無い料理を選んだらタグ欄も空になる（前の入力が混ざらない）", () => {
    expect(applySuggestion(filled, suggestion({ tags: [] })).tags).toBe("");
  });
});

describe("formatTagInput", () => {
  it("タグ入力欄に戻せる形にする", () => {
    expect(formatTagInput([{ id: "t1", name: "じゃがいも" }])).toBe("じゃがいも");
    expect(parseTagInput(formatTagInput([{ id: "t1", name: "牛肉" }, { id: "t2", name: "玉ねぎ" }]))).toEqual([
      "牛肉",
      "玉ねぎ",
    ]);
  });
});

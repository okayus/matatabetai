import { describe, expect, it } from "vitest";
import type { MealSuggestion } from "../api";
import {
  applySuggestion,
  emptyMealForm,
  formatTagInput,
  parseTagInput,
  toMealContentBody,
  toMealType,
  type MealFormState,
} from "./meal-form";

const filled: MealFormState = {
  name: " 肉じゃが ",
  eatenOn: "2026-09-02",
  mealType: "dinner",
  tags: "じゃがいも 牛肉",
  recipeUrl: "",
  shopUrl: "",
  recipeMemo: "",
  note: " おかわりした ",
};

const suggestion = (over: Partial<MealSuggestion> = {}): MealSuggestion => ({
  mealId: "m1",
  name: "肉じゃが",
  lastEatenOn: "2026-08-28",
  mataTabetai: true,
  recipeUrl: null,
  shopUrl: null,
  recipeMemo: null,
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

describe("toMealContentBody", () => {
  it("前後の空白を落とし、空のメモは null にする", () => {
    const body = toMealContentBody(filled);
    expect(body.name).toBe("肉じゃが");
    expect(body.note).toBe("おかわりした");
    expect(toMealContentBody({ ...filled, note: "  " }).note).toBeNull();
  });

  it("リンク 2 種と作り方メモは併記できる（排他ではない）", () => {
    const body = toMealContentBody({
      ...filled,
      recipeUrl: " https://example.com/a ",
      shopUrl: "https://shop.example.com/b",
      recipeMemo: " みりん多め ",
    });
    expect(body.recipeUrl).toBe("https://example.com/a");
    expect(body.shopUrl).toBe("https://shop.example.com/b");
    expect(body.recipeMemo).toBe("みりん多め");
  });

  it("空のリンク・作り方メモは null にする", () => {
    const body = toMealContentBody({ ...filled, recipeUrl: "  ", shopUrl: "", recipeMemo: " " });
    expect(body.recipeUrl).toBeNull();
    expect(body.shopUrl).toBeNull();
    expect(body.recipeMemo).toBeNull();
  });
});

describe("applySuggestion", () => {
  it("料理名・タグ・リンク 2 種・作り方メモを引き継ぐ", () => {
    const form = applySuggestion(emptyMealForm("2026-09-02"), suggestion({
      recipeUrl: "https://example.com/recipe",
      shopUrl: "https://shop.example.com/item",
      recipeMemo: "みりん多め",
      tags: [
        { id: "t1", name: "じゃがいも" },
        { id: "t2", name: "牛肉" },
      ],
    }));
    expect(form.name).toBe("肉じゃが");
    expect(form.tags).toBe("じゃがいも 牛肉");
    expect(form.recipeUrl).toBe("https://example.com/recipe");
    expect(form.shopUrl).toBe("https://shop.example.com/item");
    expect(form.recipeMemo).toBe("みりん多め");
  });

  it("食べた日・タイミング・メモは今回の食事のものなので引き継がない", () => {
    const form = applySuggestion(filled, suggestion());
    expect(form.eatenOn).toBe("2026-09-02");
    expect(form.mealType).toBe("dinner");
    expect(form.note).toBe(" おかわりした ");
  });

  it("リンクの無い料理を選んだら、前の料理の書きかけは残さない（3 項目とも空になる）", () => {
    const before = {
      ...filled,
      recipeUrl: "https://old.example",
      shopUrl: "https://old-shop.example",
      recipeMemo: "前の作り方メモ",
    };
    const after = applySuggestion(before, suggestion());
    expect(after.recipeUrl).toBe("");
    expect(after.shopUrl).toBe("");
    expect(after.recipeMemo).toBe("");
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

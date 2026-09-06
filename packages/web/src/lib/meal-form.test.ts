import { describe, expect, it } from "vitest";
import type { Meal, MealSuggestion } from "../api";
import {
  addUrlRow,
  applySuggestion,
  emptyMealForm,
  formatTagInput,
  mealFormFrom,
  parseTagInput,
  removeUrlRow,
  setUrlRow,
  toMealContentBody,
  toMealType,
  urlFieldLabel,
  urlRows,
  type MealFormState,
} from "./meal-form";

const filled: MealFormState = {
  name: " 肉じゃが ",
  eatenOn: "2026-09-02",
  mealType: "dinner",
  tags: "じゃがいも 牛肉",
  recipeUrls: [""],
  shopUrls: [""],
  recipeMemo: "",
  note: " おかわりした ",
};

const suggestion = (over: Partial<MealSuggestion> = {}): MealSuggestion => ({
  mealId: "m1",
  name: "肉じゃが",
  lastEatenOn: "2026-08-28",
  mataTabetai: true,
  recipeUrls: [],
  shopUrls: [],
  recipeMemo: null,
  tags: [],
  photo: null,
  ...over,
});

const meal = (over: Partial<Meal> = {}): Meal => ({
  id: "m1",
  name: "肉じゃが",
  eatenOn: "2026-09-02",
  mealType: "dinner",
  recipeMemo: null,
  note: null,
  mataTabetai: true,
  tags: [],
  photos: [],
  links: [],
  createdBy: "u1",
  createdByName: "かぞく",
  createdAt: "2026-09-02T10:00:00.000Z",
  updatedAt: "2026-09-02T10:00:00.000Z",
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

  it("リンク 2 種と作り方メモは併記でき、URL は何本でも送れる（ADR-010 §1）", () => {
    const body = toMealContentBody({
      ...filled,
      recipeUrls: [" https://example.com/a ", "https://example.com/b"],
      shopUrls: ["https://shop.example.com/b"],
      recipeMemo: " みりん多め ",
    });
    expect(body.recipeUrls).toEqual(["https://example.com/a", "https://example.com/b"]);
    expect(body.shopUrls).toEqual(["https://shop.example.com/b"]);
    expect(body.recipeMemo).toBe("みりん多め");
  });

  it("空欄は落とす（常に残る空の 1 行が「なし」として送られないように）", () => {
    const body = toMealContentBody({
      ...filled,
      recipeUrls: ["  ", "https://example.com/a", ""],
      shopUrls: [""],
      recipeMemo: " ",
    });
    expect(body.recipeUrls).toEqual(["https://example.com/a"]);
    expect(body.shopUrls).toEqual([]);
    expect(body.recipeMemo).toBeNull();
  });
});

// URL 欄の行操作（ADR-010 §6）。行が 0 にならないのが要 — 0 行だと「追加」を押さないと
// 1 本目が入れられない
describe("urlRows / addUrlRow / setUrlRow / removeUrlRow", () => {
  it("空の並びは 1 行の空欄として扱う", () => {
    expect(urlRows([])).toEqual([""]);
    expect(urlRows(["https://a.example"])).toEqual(["https://a.example"]);
  });

  it("追加は末尾に空欄を置く", () => {
    expect(addUrlRow(["https://a.example"])).toEqual(["https://a.example", ""]);
    expect(addUrlRow([])).toEqual(["", ""]);
  });

  it("入力は指した行だけを差し替える", () => {
    expect(setUrlRow(["https://a.example", "https://b.example"], 1, "https://c.example")).toEqual([
      "https://a.example",
      "https://c.example",
    ]);
  });

  it("外すと詰まる。最後の 1 行を外しても空欄が 1 行残る", () => {
    expect(removeUrlRow(["https://a.example", "https://b.example"], 0)).toEqual([
      "https://b.example",
    ]);
    expect(removeUrlRow(["https://a.example"], 0)).toEqual([""]);
  });
});

describe("urlFieldLabel", () => {
  it("1 行なら番号なし、2 行以上なら番号つき（読み上げでどれか分かるように）", () => {
    expect(urlFieldLabel("レシピ URL", 0, 1)).toBe("レシピ URL");
    expect(urlFieldLabel("レシピ URL", 0, 2)).toBe("レシピ URL 1");
    expect(urlFieldLabel("レシピ URL", 1, 2)).toBe("レシピ URL 2");
  });
});

describe("applySuggestion", () => {
  it("料理名・タグ・リンク 2 種・作り方メモを引き継ぐ（URL は本数ぶん全部）", () => {
    const form = applySuggestion(emptyMealForm("2026-09-02"), suggestion({
      recipeUrls: ["https://example.com/recipe", "https://example.com/recipe2"],
      shopUrls: ["https://shop.example.com/item"],
      recipeMemo: "みりん多め",
      tags: [
        { id: "t1", name: "じゃがいも" },
        { id: "t2", name: "牛肉" },
      ],
    }));
    expect(form.name).toBe("肉じゃが");
    expect(form.tags).toBe("じゃがいも 牛肉");
    expect(form.recipeUrls).toEqual([
      "https://example.com/recipe",
      "https://example.com/recipe2",
    ]);
    expect(form.shopUrls).toEqual(["https://shop.example.com/item"]);
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
      recipeUrls: ["https://old.example", "https://old2.example"],
      shopUrls: ["https://old-shop.example"],
      recipeMemo: "前の作り方メモ",
    };
    const after = applySuggestion(before, suggestion());
    expect(after.recipeUrls).toEqual([""]);
    expect(after.shopUrls).toEqual([""]);
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

// 編集フォームの初期値（ADR-008 §7）。引き継ぎ（applySuggestion）と違い、
// 直すのは「この記録そのもの」なので、その回のもの（日付・タイミング・メモ）まで写す
describe("mealFormFrom", () => {
  it("記録の全部を欄に写す（メモも日付もタイミングも。URL は kind ごとに並べ直す）", () => {
    expect(
      mealFormFrom(
        meal({
          note: "おかわりした",
          links: [
            { id: "l1", kind: "recipe", url: "https://example.com/recipe", preview: { status: "ok", title: "肉じゃが", description: null, siteName: null, hasImage: false } },
            { id: "l2", kind: "recipe", url: "https://example.com/recipe2", preview: { status: "failed" } },
            { id: "l3", kind: "shop", url: "https://shop.example.com/item", preview: { status: "pending" } },
          ],
          recipeMemo: "みりん多め",
          tags: [
            { id: "t1", name: "じゃがいも" },
            { id: "t2", name: "牛肉" },
          ],
        }),
      ),
    ).toEqual({
      name: "肉じゃが",
      eatenOn: "2026-09-02",
      mealType: "dinner",
      tags: "じゃがいも 牛肉",
      recipeUrls: ["https://example.com/recipe", "https://example.com/recipe2"],
      shopUrls: ["https://shop.example.com/item"],
      recipeMemo: "みりん多め",
      note: "おかわりした",
    });
  });

  it("無い値は空欄（null を文字列 \"null\" にしない）", () => {
    const form = mealFormFrom(meal({ mealType: null }));
    expect(form.mealType).toBe("");
    expect(form.recipeUrls).toEqual([""]);
    expect(form.shopUrls).toEqual([""]);
    expect(form.recipeMemo).toBe("");
    expect(form.note).toBe("");
    expect(form.tags).toBe("");
  });

  it("そのまま保存しても記録は変わらない（欄 → body の往復で値が落ちない）", () => {
    const original = meal({
      note: "おかわりした",
      links: [
        { id: "l1", kind: "recipe", url: "https://example.com/recipe", preview: { status: "failed" } },
      ],
      recipeMemo: "みりん多め",
      tags: [{ id: "t1", name: "じゃがいも" }],
    });
    expect(toMealContentBody(mealFormFrom(original))).toEqual({
      name: "肉じゃが",
      eatenOn: "2026-09-02",
      mealType: "dinner",
      recipeUrls: ["https://example.com/recipe"],
      shopUrls: [],
      recipeMemo: "みりん多め",
      note: "おかわりした",
      tags: ["じゃがいも"],
    });
  });
});

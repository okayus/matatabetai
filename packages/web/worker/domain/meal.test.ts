import { describe, expect, it } from "vitest";
import {
  CreateMealInput,
  EatenOn,
  MealListQuery,
  MealStatsQuery,
  TagName,
  isHttpUrl,
  normalizeName,
  recipeSourceFromColumns,
  recipeSourceToColumns,
  uniqueTagNames,
  type RecipeSource,
} from "./meal";

describe("normalizeName", () => {
  it("NFKC + trim + 小文字（全角英数・半角カナ・全角スペース）", () => {
    expect(normalizeName("　Ｃｕｒｒｙ　")).toBe("curry");
    expect(normalizeName("ｶﾚｰﾗｲｽ")).toBe("カレーライス");
    expect(normalizeName("Tomato")).toBe("tomato");
  });
  it("かなとカナは別の正規形のまま（NFKC は折りたたまない）", () => {
    expect(normalizeName("とまと")).not.toBe(normalizeName("トマト"));
  });
});

describe("EatenOn", () => {
  it.each(["2026-09-01", "2026-02-28", "2028-02-29"])("accepts %s", (s) => {
    expect(EatenOn.safeParse(s).success).toBe(true);
  });
  it.each(["2026-02-30", "2026-13-01", "2026-9-1", "20260901", "0202-01-01", "きょう"])(
    "rejects %s",
    (s) => {
      expect(EatenOn.safeParse(s).success).toBe(false);
    },
  );
});

describe("isHttpUrl", () => {
  it("http(s) だけを許す（<a href> に出すので javascript: は落とす）", () => {
    expect(isHttpUrl("https://example.com/recipe")).toBe(true);
    expect(isHttpUrl("http://example.com")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("ftp://example.com")).toBe(false);
    expect(isHttpUrl("example.com")).toBe(false);
  });
});

describe("RecipeSource の平坦化", () => {
  const cases: RecipeSource[] = [
    { type: "url", url: "https://example.com/r/1" },
    { type: "text", text: "じゃがいもを茹でる\n潰す" },
    { type: "none" },
  ];
  it.each(cases)("round-trips %j", (rs) => {
    const cols = recipeSourceToColumns(rs);
    expect(recipeSourceFromColumns(cols.recipeSourceType, cols.url, cols.recipeText)).toEqual(rs);
  });
  it("列が欠けた不整合行は none に落ちる（CHECK があるので通常は来ない）", () => {
    expect(recipeSourceFromColumns("url", null, null)).toEqual({ type: "none" });
    expect(recipeSourceFromColumns("text", "https://x", null)).toEqual({ type: "none" });
    expect(recipeSourceFromColumns("garbage", "https://x", "y")).toEqual({ type: "none" });
  });
});

describe("uniqueTagNames", () => {
  it("正規形で重複を除き、表示は最初の表記が勝つ", () => {
    const input = ["トマト", "ﾄﾏﾄ", "Tomato", "tomato", "とまと"].map((s) => TagName.parse(s));
    expect(uniqueTagNames(input)).toEqual(["トマト", "Tomato", "とまと"]);
  });
});

describe("MealListQuery", () => {
  it("タグは正規形で重複を畳み、mataTabetai は無指定で偽・\"1\" で真", () => {
    const r = MealListQuery.safeParse({ tags: ["トマト", "ﾄﾏﾄ"] });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.tags).toEqual(["トマト"]);
      expect(r.data.mataTabetai).toBe(false);
    }
    const on = MealListQuery.safeParse({ tags: [], mataTabetai: "1" });
    expect(on.success).toBe(true);
    if (on.success) expect(on.data.mataTabetai).toBe(true);
  });
  it("mataTabetai は「絞るか絞らないか」の一択 — \"1\" 以外の値は弾く", () => {
    expect(MealListQuery.safeParse({ tags: [], mataTabetai: "true" }).success).toBe(false);
    expect(MealListQuery.safeParse({ tags: [], mataTabetai: "0" }).success).toBe(false);
  });
});

describe("MealStatsQuery", () => {
  it("from / to は任意で、片方だけ・同じ日も許す", () => {
    expect(MealStatsQuery.safeParse({}).success).toBe(true);
    expect(MealStatsQuery.safeParse({ from: "2026-01-01" }).success).toBe(true);
    expect(MealStatsQuery.safeParse({ to: "2026-01-31" }).success).toBe(true);
    expect(
      MealStatsQuery.safeParse({ from: "2026-09-02", to: "2026-09-02" }).success,
    ).toBe(true);
  });
  it("逆転した期間（from > to）は弾く", () => {
    expect(
      MealStatsQuery.safeParse({ from: "2026-09-02", to: "2026-09-01" }).success,
    ).toBe(false);
  });
});

describe("CreateMealInput", () => {
  const base = {
    name: "肉じゃが",
    eatenOn: "2026-09-01",
    mealType: null,
    recipeSource: { type: "none" },
    note: null,
    tags: [],
  };
  it("最小の投稿が通り、省略可能な列は null になる", () => {
    const r = CreateMealInput.safeParse({ name: "肉じゃが", eatenOn: "2026-09-01", recipeSource: { type: "none" } });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.mealType).toBeNull();
      expect(r.data.note).toBeNull();
      expect(r.data.tags).toEqual([]);
    }
  });
  it("空文字の note は null になる", () => {
    const r = CreateMealInput.safeParse({ ...base, note: "  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.note).toBeNull();
  });
  it("note は改行を許すが他の制御文字は拒む", () => {
    expect(CreateMealInput.safeParse({ ...base, note: "うまい\nまた作る" }).success).toBe(true);
    expect(CreateMealInput.safeParse({ ...base, note: `a${String.fromCharCode(7)}b` }).success).toBe(false);
  });
  it("recipeSource url は http(s) 以外を拒む", () => {
    expect(
      CreateMealInput.safeParse({ ...base, recipeSource: { type: "url", url: "javascript:alert(1)" } })
        .success,
    ).toBe(false);
    expect(
      CreateMealInput.safeParse({ ...base, recipeSource: { type: "url", url: "https://example.com" } })
        .success,
    ).toBe(true);
  });
  it("タグは 20 個まで", () => {
    const tags = Array.from({ length: 21 }, (_, i) => `tag${i}`);
    expect(CreateMealInput.safeParse({ ...base, tags }).success).toBe(false);
    expect(CreateMealInput.safeParse({ ...base, tags: tags.slice(0, 20) }).success).toBe(true);
  });
  it("料理名は 1〜100 文字", () => {
    expect(CreateMealInput.safeParse({ ...base, name: "" }).success).toBe(false);
    expect(CreateMealInput.safeParse({ ...base, name: "あ".repeat(101) }).success).toBe(false);
  });
});

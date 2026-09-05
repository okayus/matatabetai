import { describe, expect, it } from "vitest";
import {
  EMPTY_MEAL_FILTER,
  isEmptyMealFilter,
  mealFilterSearch,
  parseMealFilter,
  toggleFilterTag,
} from "./meal-filter";

describe("parseMealFilter", () => {
  it("空のクエリは絞り込みなし", () => {
    expect(parseMealFilter("")).toEqual(EMPTY_MEAL_FILTER);
    expect(parseMealFilter("?")).toEqual(EMPTY_MEAL_FILTER);
    expect(isEmptyMealFilter(parseMealFilter(""))).toBe(true);
  });
  it("q / tags（繰り返し）/ mataTabetai=1 を読む", () => {
    expect(parseMealFilter("?q=%E3%82%AB%E3%83%AC%E3%83%BC&tags=鶏肉&tags=玉ねぎ&mataTabetai=1")).toEqual({
      q: "カレー",
      mataTabetai: true,
      tags: ["鶏肉", "玉ねぎ"],
    });
  });
  it("mataTabetai は 1 だけが真（API と同じ読み）", () => {
    expect(parseMealFilter("?mataTabetai=true").mataTabetai).toBe(false);
    expect(parseMealFilter("?mataTabetai=0").mataTabetai).toBe(false);
  });
  it("空白だけの q・空のタグ・同じタグの重複は落とす。知らないパラメータは無視", () => {
    expect(parseMealFilter("?q=%20%20&tags=&tags=鶏肉&tags=鶏肉&view=list")).toEqual({
      q: "",
      mataTabetai: false,
      tags: ["鶏肉"],
    });
  });
});

describe("mealFilterSearch", () => {
  it("絞っていなければ空文字（URL は素の / に戻る）", () => {
    expect(mealFilterSearch(EMPTY_MEAL_FILTER)).toBe("");
  });
  it("parse と往復して値が落ちない", () => {
    const filter = { q: "肉じゃが 50%_off", mataTabetai: true, tags: ["じゃがいも", "牛肉"] };
    expect(parseMealFilter(mealFilterSearch(filter))).toEqual(filter);
  });
  it("空の q や false の mataTabetai はクエリに出さない", () => {
    expect(mealFilterSearch({ q: "", mataTabetai: false, tags: ["鶏肉"] })).toBe(
      `?tags=${encodeURIComponent("鶏肉")}`,
    );
  });
});

describe("toggleFilterTag", () => {
  it("無ければ足し、あれば外す。他の条件は触らない", () => {
    const base = { q: "カレー", mataTabetai: true, tags: ["鶏肉"] };
    const added = toggleFilterTag(base, "玉ねぎ");
    expect(added).toEqual({ q: "カレー", mataTabetai: true, tags: ["鶏肉", "玉ねぎ"] });
    expect(toggleFilterTag(added, "鶏肉")).toEqual({ q: "カレー", mataTabetai: true, tags: ["玉ねぎ"] });
  });
});

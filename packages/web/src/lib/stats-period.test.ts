import { describe, expect, it } from "vitest";
import {
  canStepForward,
  isInvertedRange,
  periodName,
  periodRange,
  stepPeriod,
  type StatsPeriod,
} from "./stats-period";

const week = (offset: number): StatsPeriod => ({ unit: "week", offset });
const month = (offset: number): StatsPeriod => ({ unit: "month", offset });

describe("periodRange — 週", () => {
  it("今週は today を含む日曜〜土曜（日本のカレンダーに合わせる）", () => {
    // 2026-09-03 は木曜
    expect(periodRange(week(0), "2026-09-03")).toEqual({ from: "2026-08-30", to: "2026-09-05" });
  });
  it("日曜そのものは、その日が週のはじまり（前の週に寄せない）", () => {
    expect(periodRange(week(0), "2026-08-30")).toEqual({ from: "2026-08-30", to: "2026-09-05" });
  });
  it("土曜そのものは、その週の終わり", () => {
    expect(periodRange(week(0), "2026-09-05")).toEqual({ from: "2026-08-30", to: "2026-09-05" });
  });
  it("遡ると 7 日ずつ動き、月をまたいでも数え直さない", () => {
    expect(periodRange(week(-1), "2026-09-03")).toEqual({ from: "2026-08-23", to: "2026-08-29" });
    expect(periodRange(week(-5), "2026-09-03")).toEqual({ from: "2026-07-26", to: "2026-08-01" });
  });
  it("年をまたぐ週は、またいだまま 1 つの期間", () => {
    expect(periodRange(week(0), "2026-01-01")).toEqual({ from: "2025-12-28", to: "2026-01-03" });
  });
});

describe("periodRange — 月", () => {
  it("今月は 1 日から末日まで（今日で切らない）", () => {
    expect(periodRange(month(0), "2026-09-03")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });
  it("末日は月ごとに違う", () => {
    expect(periodRange(month(-1), "2026-09-03").to).toBe("2026-08-31");
    expect(periodRange(month(0), "2026-02-10").to).toBe("2026-02-28");
    expect(periodRange(month(0), "2028-02-10").to).toBe("2028-02-29");
  });
  it("遡ると年をまたぐ", () => {
    expect(periodRange(month(-9), "2026-09-03")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });
  it("月末に立っていても、遡り先の月の末日で切る（31 日 → 30 日）", () => {
    expect(periodRange(month(-1), "2026-08-31")).toEqual({ from: "2026-07-01", to: "2026-07-31" });
    expect(periodRange(month(-1), "2026-05-31")).toEqual({ from: "2026-04-01", to: "2026-04-30" });
  });
});

describe("periodRange — ぜんぶ / 日付を指定", () => {
  it("ぜんぶは両端を切らない", () => {
    expect(periodRange({ unit: "all" }, "2026-09-03")).toEqual({});
  });
  it("空欄の端は指定なしとして落ちる（片側だけの指定ができる）", () => {
    const p: StatsPeriod = { unit: "custom", from: "2026-01-01", to: "" };
    expect(periodRange(p, "2026-09-03")).toEqual({ from: "2026-01-01" });
    expect(periodRange({ unit: "custom", from: "", to: "" }, "2026-09-03")).toEqual({});
  });
});

describe("stepPeriod", () => {
  it("未来へは進めない（記録は過去にしかない）", () => {
    expect(stepPeriod(week(0), 1)).toEqual(week(0));
    expect(stepPeriod(month(-1), 1)).toEqual(month(0));
    expect(canStepForward(week(0))).toBe(false);
    expect(canStepForward(week(-1))).toBe(true);
  });
  it("ぜんぶ・日付を指定は動かない（ステッパーを持たない）", () => {
    const all: StatsPeriod = { unit: "all" };
    expect(stepPeriod(all, -1)).toEqual(all);
    expect(canStepForward(all)).toBe(false);
  });
});

describe("periodName", () => {
  it("直近 2 つは呼び名、それより前は数で言う", () => {
    expect([periodName(week(0)), periodName(week(-1)), periodName(week(-3))]).toEqual([
      "今週",
      "先週",
      "3 週間前",
    ]);
    expect([periodName(month(0)), periodName(month(-1)), periodName(month(-3))]).toEqual([
      "今月",
      "先月",
      "3 か月前",
    ]);
  });
});

describe("isInvertedRange", () => {
  it("日付を指定したときだけ、逆転を止める", () => {
    expect(isInvertedRange({ unit: "custom", from: "2026-09-10", to: "2026-09-01" })).toBe(true);
    expect(isInvertedRange({ unit: "custom", from: "2026-09-10", to: "" })).toBe(false);
    expect(isInvertedRange(week(0))).toBe(false);
  });
});

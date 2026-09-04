import { describe, expect, it } from "vitest";
import { sortByRecency } from "./meal-order";

describe("sortByRecency", () => {
  const item = (eatenOn: string, createdAt: string) => ({ eatenOn, createdAt });

  it("食べた日の新しい順。同じ日は記録した順の新しいほうが先（サーバーの並びと同じ）", () => {
    expect(
      sortByRecency([
        item("2026-09-01", "2026-09-01T10:00:00.000Z"),
        item("2026-09-03", "2026-09-03T10:00:00.000Z"),
        item("2026-09-01", "2026-09-02T10:00:00.000Z"),
      ]),
    ).toEqual([
      item("2026-09-03", "2026-09-03T10:00:00.000Z"),
      item("2026-09-01", "2026-09-02T10:00:00.000Z"),
      item("2026-09-01", "2026-09-01T10:00:00.000Z"),
    ]);
  });

  it("元の配列は動かさない（一覧の state はいつも新しい配列で差し替える）", () => {
    const items = [item("2026-09-01", "x"), item("2026-09-03", "y")];
    expect(sortByRecency(items)).not.toBe(items);
    expect(items[0]?.eatenOn).toBe("2026-09-01");
  });
});

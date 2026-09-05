import { describe, expect, it } from "vitest";
import { photoGridItems } from "./photo-grid";

// 一覧の並び（eaten_on DESC, created_at DESC）で来る前提の、写真つき投稿の最小形
const meal = (id: string, ...photoIds: string[]) => ({
  id,
  photos: photoIds.map((p) => ({ id: p })),
});

describe("photoGridItems", () => {
  it("写真の無い投稿はセルを持たない（プレースホルダも出さない）", () => {
    const items = photoGridItems([meal("a", "p1"), meal("b"), meal("c", "p2")]);
    expect(items.map((x) => x.meal.id)).toEqual(["a", "c"]);
  });

  it("並びは一覧の順のまま（グリッド側で並べ替えない）", () => {
    const items = photoGridItems([meal("new", "p1"), meal("mid", "p2"), meal("old", "p3")]);
    expect(items.map((x) => x.meal.id)).toEqual(["new", "mid", "old"]);
  });

  it("代表は 1 枚目（サーバー順 created_at ASC の先頭 = カルーセルの先頭と同じ）", () => {
    const items = photoGridItems([meal("a", "first", "second", "third")]);
    expect(items[0]?.cover.id).toBe("first");
  });

  it("1 投稿は 1 セル（複数枚でもセルは増えない）", () => {
    const items = photoGridItems([meal("a", "p1", "p2", "p3"), meal("b", "p4")]);
    expect(items).toHaveLength(2);
  });

  it("記録が無ければ空", () => {
    expect(photoGridItems([])).toEqual([]);
  });
});

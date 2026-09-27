import { describe, expect, it } from "vitest";
import { nextCycleIndex, photoGridItems } from "./photo-grid";

// 一覧の並び（eaten_on DESC, created_at DESC）で来る前提の、写真つき投稿の最小形
const meal = (id: string, ...photoIds: string[]) => ({
  id,
  photos: photoIds.map((p) => ({ id: p })),
});

describe("photoGridItems", () => {
  it("写真の無い投稿はセルを持たない（プレースホルダも出さない）", () => {
    const items = photoGridItems([meal("a", "p1"), meal("b"), meal("c", "p2")]);
    expect(items.map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("並びは一覧の順のまま（グリッド側で並べ替えない）", () => {
    const items = photoGridItems([meal("new", "p1"), meal("mid", "p2"), meal("old", "p3")]);
    expect(items.map((x) => x.id)).toEqual(["new", "mid", "old"]);
  });

  it("最初に見せるのは 1 枚目（サーバー順 created_at ASC の先頭 = カルーセルの先頭と同じ）", () => {
    const items = photoGridItems([meal("a", "first", "second", "third")]);
    expect(items[0]?.photos[0].id).toBe("first");
  });

  it("1 投稿は 1 セル（複数枚でもセルは増えない）", () => {
    const items = photoGridItems([meal("a", "p1", "p2", "p3"), meal("b", "p4")]);
    expect(items).toHaveLength(2);
  });

  it("記録が無ければ空", () => {
    expect(photoGridItems([])).toEqual([]);
  });
});

describe("nextCycleIndex", () => {
  it("は 1 枚ずつ次へ送り、最後の次は先頭へ戻る（自動の送りは端で止まらず巡る）", () => {
    expect(nextCycleIndex(0, 3)).toBe(1);
    expect(nextCycleIndex(1, 3)).toBe(2);
    expect(nextCycleIndex(2, 3)).toBe(0);
  });

  it("は 1 枚以下なら先頭のまま（送る相手がいない）", () => {
    expect(nextCycleIndex(0, 1)).toBe(0);
    expect(nextCycleIndex(0, 0)).toBe(0);
  });

  it("は範囲の外からは先頭へ戻る（巡っている途中で写真を消されて count が減った直後）", () => {
    expect(nextCycleIndex(4, 3)).toBe(0);
    expect(nextCycleIndex(-1, 3)).toBe(0);
  });
});

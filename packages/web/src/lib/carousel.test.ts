import { describe, expect, it } from "vitest";
import { clampIndex, snapIndex } from "./carousel";

describe("clampIndex", () => {
  it("は範囲外を両端に寄せる", () => {
    expect(clampIndex(-1, 3)).toBe(0);
    expect(clampIndex(3, 3)).toBe(2);
    expect(clampIndex(1, 3)).toBe(1);
  });

  it("は写真が無ければ先頭を返す（削除で 0 枚になった直後）", () => {
    expect(clampIndex(2, 0)).toBe(0);
  });
});

describe("snapIndex", () => {
  it("は半分を越えたところで次の 1 枚に変わる", () => {
    expect(snapIndex(0, 300, 3)).toBe(0);
    expect(snapIndex(149, 300, 3)).toBe(0);
    expect(snapIndex(151, 300, 3)).toBe(1);
    expect(snapIndex(600, 300, 3)).toBe(2);
  });

  it("は指を離しきる前のはみ出しを端に寄せる（iOS のゴムのような戻り）", () => {
    expect(snapIndex(-40, 300, 3)).toBe(0);
    expect(snapIndex(940, 300, 3)).toBe(2);
  });

  it("はまだ描かれていない scroller（幅 0）では先頭を返す", () => {
    expect(snapIndex(0, 0, 3)).toBe(0);
  });
});

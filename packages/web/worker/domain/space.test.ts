import { describe, expect, it } from "vitest";
import { SpaceName, defaultSpaceName } from "./space";

describe("SpaceName", () => {
  it("default name from the longest display name still fits", () => {
    const name = defaultSpaceName("あ".repeat(32));
    expect(SpaceName.safeParse(name).success).toBe(true);
    expect(name.endsWith("の食卓")).toBe(true);
  });
  it("rejects empty and control chars", () => {
    expect(SpaceName.safeParse("").success).toBe(false);
    expect(SpaceName.safeParse(`a${String.fromCharCode(1)}b`).success).toBe(false);
  });
});

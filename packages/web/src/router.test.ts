import { describe, expect, it } from "vitest";
import { matchPath } from "./router";

describe("matchPath", () => {
  it("matches literal and param segments", () => {
    expect(matchPath("/", "/")).toEqual({});
    expect(matchPath("/spaces/:spaceId/settings", "/spaces/abc/settings")).toEqual({ spaceId: "abc" });
  });
  it("rejects different lengths, mismatched literals, and empty params", () => {
    expect(matchPath("/spaces/:spaceId", "/spaces/abc/settings")).toBeNull();
    expect(matchPath("/spaces/:spaceId/settings", "/spaces/abc/members")).toBeNull();
    expect(matchPath("/spaces/:spaceId", "/spaces/")).toBeNull();
  });
});

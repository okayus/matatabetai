import { describe, expect, it } from "vitest";
import type { SpaceSummary } from "../api";
import { primarySpace } from "./space";

const space = (id: string, role: SpaceSummary["role"]): SpaceSummary => ({
  id,
  name: id,
  role,
  memberCount: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
});

describe("primarySpace", () => {
  it("owner のスペースが最優先（並び順に依らない）", () => {
    expect(primarySpace([space("a", "member"), space("b", "owner")])?.id).toBe("b");
  });
  it("owner が無ければ最初の所属先", () => {
    expect(primarySpace([space("a", "member"), space("b", "member")])?.id).toBe("a");
  });
  it("どこにも所属していなければ undefined", () => {
    expect(primarySpace([])).toBeUndefined();
  });
});

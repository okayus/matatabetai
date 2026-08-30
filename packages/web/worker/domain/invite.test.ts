import { describe, expect, it } from "vitest";
import {
  INVITE_TTL_MS,
  inviteExpiresAt,
  inviteUrl,
  inviteUsability,
  isInviteTokenShape,
} from "./invite";

const now = new Date("2026-08-30T12:00:00.000Z");
const row = {
  id: "00000000-0000-4000-8000-000000000010",
  spaceId: "00000000-0000-4000-8000-000000000020",
  expiresAt: new Date(now.getTime() + 60_000).toISOString(),
  consumedAt: null,
};

describe("inviteUsability", () => {
  it("unknown token → invite_invalid", () => {
    const r = inviteUsability(undefined, now);
    expect(r.isErr() && r.error.type).toBe("invite_invalid");
  });
  it("consumed wins over expired (the family sees 'already used', not 'expired')", () => {
    const r = inviteUsability(
      { ...row, consumedAt: "2026-01-01T00:00:00.000Z", expiresAt: "2026-01-02T00:00:00.000Z" },
      now,
    );
    expect(r.isErr() && r.error.type).toBe("invite_consumed");
  });
  it("expired at exactly expiresAt", () => {
    const r = inviteUsability({ ...row, expiresAt: now.toISOString() }, now);
    expect(r.isErr() && r.error.type).toBe("invite_expired");
  });
  it("usable → branded ids", () => {
    const r = inviteUsability(row, now);
    expect(r.isOk() && r.value).toEqual({ id: row.id, spaceId: row.spaceId });
  });
});

describe("token helpers", () => {
  it("token shape is 64 hex chars", () => {
    expect(isInviteTokenShape("a".repeat(64))).toBe(true);
    expect(isInviteTokenShape("A".repeat(64))).toBe(false);
    expect(isInviteTokenShape("a".repeat(63))).toBe(false);
  });
  it("expiry is 7 days", () => {
    expect(new Date(inviteExpiresAt(now)).getTime() - now.getTime()).toBe(INVITE_TTL_MS);
    expect(INVITE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
  it("the link carries the token in the fragment only", () => {
    const url = new URL(inviteUrl("https://example.test", "ab".repeat(32)));
    expect(url.pathname).toBe("/invite");
    expect(url.search).toBe("");
    expect(url.hash).toBe(`#token=${"ab".repeat(32)}`);
  });
});

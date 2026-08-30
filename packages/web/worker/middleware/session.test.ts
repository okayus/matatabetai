import { describe, expect, it } from "vitest";
import { SESSION_MS, isLocalOrigin, shouldSlide } from "./session";

describe("dev bypass twin guard: isLocalOrigin", () => {
  it.each(["http://localhost:5573", "http://127.0.0.1:5183", "http://[::1]:3000"])("%s is local", (o) => {
    expect(isLocalOrigin(o)).toBe(true);
  });
  it.each(["https://matatabetai.shiraoka.workers.dev", "http://localhost.evil.test", "not a url"])(
    "%s is not local",
    (o) => {
      expect(isLocalOrigin(o)).toBe(false);
    },
  );
});

describe("sliding expiry", () => {
  const now = Date.UTC(2026, 7, 30);
  it("slides only when less than half the lifetime remains", () => {
    expect(shouldSlide(now + SESSION_MS, now)).toBe(false);
    expect(shouldSlide(now + SESSION_MS / 2 + 1, now)).toBe(false);
    expect(shouldSlide(now + SESSION_MS / 2 - 1, now)).toBe(true);
  });
});

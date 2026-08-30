import { describe, expect, it } from "vitest";
import { challengeCookieName, cookieBase, isHttps, sessionCookieName } from "./cookies";

describe("cookie attributes derive from ORIGIN", () => {
  it("https → __Host- names + Secure", () => {
    const o = "https://matatabetai.shiraoka.workers.dev";
    expect(isHttps(o)).toBe(true);
    expect(sessionCookieName(o)).toBe("__Host-session");
    expect(challengeCookieName(o)).toBe("__Host-challenge");
    expect(cookieBase(o)).toEqual({ httpOnly: true, secure: true, sameSite: "Lax", path: "/" });
  });
  it("http (local dev / e2e) → bare names, no Secure", () => {
    const o = "http://localhost:5573";
    expect(sessionCookieName(o)).toBe("session");
    expect(cookieBase(o).secure).toBe(false);
  });
  it("never sets Domain", () => {
    expect(cookieBase("https://x.test")).not.toHaveProperty("domain");
  });
});

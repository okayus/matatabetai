import { expect, test } from "@playwright/test";

// ミドルウェア配線の回帰防止: CSP / X-Frame-Options などが SPA・API・/health のどこにも付く。
// e2e は http なので http 形（script-src に 'unsafe-inline'、HSTS なし）を断定する。
// 本番（https）は strict（'self' のみ、HSTS あり）— worker/lib/csp.test.ts が固定する。
for (const path of ["/", "/api/auth/me", "/health"]) {
  test(`security headers on ${path}`, async ({ request }) => {
    const res = await request.get(path);
    const h = res.headers();
    expect(h["content-security-policy"]).toContain("default-src 'self'");
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"]).toContain("script-src 'self' 'unsafe-inline'");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["strict-transport-security"]).toBeUndefined();
  });
}

test("unknown /api path never falls through to the SPA", async ({ request }) => {
  const res = await request.get("/api/does-not-exist");
  expect([401, 404]).toContain(res.status());
  expect(res.headers()["content-type"]).toContain("application/json");
});

test("a non-GET API request without a matching Origin is refused", async ({ request }) => {
  const res = await request.post("/api/auth/login/begin", { headers: { Origin: "https://evil.example" } });
  expect(res.status()).toBe(403);
  expect(await res.json()).toEqual({ error: { type: "csrf_origin_mismatch" } });
});

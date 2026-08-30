import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaderOptions } from "./csp";

describe("CSP by scheme", () => {
  it("https is strict: no inline scripts or styles", () => {
    const csp = contentSecurityPolicy(true);
    expect(csp.scriptSrc).toEqual(["'self'"]);
    expect(csp.styleSrc).toEqual(["'self'"]);
    expect(csp.frameAncestors).toEqual(["'none'"]);
    expect(securityHeaderOptions(true).strictTransportSecurity).toContain("max-age=");
  });
  it("http (vite dev / e2e) allows the HMR preamble and websocket, nothing else", () => {
    const csp = contentSecurityPolicy(false);
    expect(csp.scriptSrc).toEqual(["'self'", "'unsafe-inline'"]);
    expect(csp.connectSrc).toContain("ws:");
    expect(csp.objectSrc).toEqual(["'none'"]);
    expect(securityHeaderOptions(false).strictTransportSecurity).toBe(false);
  });
});

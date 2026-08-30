import { describe, expect, it } from "vitest";
import { fromBase64Url, toBase64Url, utf8Bytes } from "./base64url";

describe("base64url", () => {
  it("round-trips arbitrary bytes without padding", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255, 62, 63]);
    const s = toBase64Url(bytes);
    expect(s).not.toMatch(/[+/=]/);
    expect(Array.from(fromBase64Url(s))).toEqual(Array.from(bytes));
  });
  it("utf8Bytes returns a Uint8Array backed by a fresh ArrayBuffer", () => {
    const b = utf8Bytes("またたべたい");
    expect(b.buffer.byteLength).toBe(b.byteLength);
    expect(new TextDecoder().decode(b)).toBe("またたべたい");
  });
});

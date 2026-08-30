import { describe, expect, it } from "vitest";
import { randomTokenHex, secretEquals, sha256Hex } from "./token";

describe("token", () => {
  it("randomTokenHex is 64 lowercase hex and unique", () => {
    const a = randomTokenHex();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(randomTokenHex()).not.toBe(a);
  });
  it("sha256Hex matches a known vector", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
  it("secretEquals compares by value regardless of length", async () => {
    expect(await secretEquals("token", "token")).toBe(true);
    expect(await secretEquals("token", "token2")).toBe(false);
    expect(await secretEquals("", "x")).toBe(false);
  });
});

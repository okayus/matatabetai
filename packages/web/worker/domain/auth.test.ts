import { describe, expect, it } from "vitest";
import {
  BeginRegistrationInput,
  CredentialId,
  DisplayName,
  UserId,
  VerifyRegistrationInput,
  isCounterRegression,
} from "./auth";

const CONTROL = String.fromCharCode(1);
const FAMILY_EMOJI = String.fromCodePoint(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);

describe("DisplayName", () => {
  it("trims and accepts 1..32 chars including emoji / ZWJ sequences", () => {
    expect(DisplayName.parse("  まま  ")).toBe("まま");
    expect(DisplayName.safeParse(FAMILY_EMOJI).success).toBe(true);
    expect(DisplayName.safeParse("a".repeat(32)).success).toBe(true);
  });
  it("rejects empty, too long, and control characters", () => {
    expect(DisplayName.safeParse("   ").success).toBe(false);
    expect(DisplayName.safeParse("a".repeat(33)).success).toBe(false);
    expect(DisplayName.safeParse(`bad${CONTROL}name`).success).toBe(false);
  });
});

describe("UserId / CredentialId", () => {
  it("UserId is a UUID", () => {
    expect(UserId.safeParse(crypto.randomUUID()).success).toBe(true);
    expect(UserId.safeParse("not-a-uuid").success).toBe(false);
  });
  it("CredentialId is base64url of reasonable length", () => {
    expect(CredentialId.safeParse("AbC_-123456789012345").success).toBe(true);
    expect(CredentialId.safeParse("short").success).toBe(false);
    expect(CredentialId.safeParse("has+plus/and=padding0000").success).toBe(false);
  });
});

describe("request shapes", () => {
  it("register/begin accepts either token, not requiring both", () => {
    expect(BeginRegistrationInput.safeParse({ displayName: "x", inviteToken: "a".repeat(64) }).success).toBe(true);
    expect(BeginRegistrationInput.safeParse({ displayName: "x", initialRegistrationToken: "t" }).success).toBe(true);
    expect(BeginRegistrationInput.safeParse({ displayName: "x" }).success).toBe(true);
    expect(BeginRegistrationInput.safeParse({}).success).toBe(false);
  });
  it("register/verify normalizes deviceName and defaults clientExtensionResults", () => {
    const r = VerifyRegistrationInput.parse({
      response: {
        id: "AbC_-123456789012345",
        rawId: "AbC_-123456789012345",
        type: "public-key",
        response: { clientDataJSON: "c", attestationObject: "a", transports: ["internal"] },
      },
      deviceName: "   ",
    });
    expect(r.deviceName).toBeNull();
    expect(r.response.clientExtensionResults).toEqual({});
    expect(r.response.response["transports"]).toEqual(["internal"]);
  });
});

describe("isCounterRegression", () => {
  it("exempts synced passkeys that always report 0", () => {
    expect(isCounterRegression(0, 0)).toBe(false);
    expect(isCounterRegression(0, 5)).toBe(false);
  });
  it("rejects a counter that did not advance", () => {
    expect(isCounterRegression(5, 5)).toBe(true);
    expect(isCounterRegression(5, 4)).toBe(true);
    expect(isCounterRegression(5, 6)).toBe(false);
  });
});

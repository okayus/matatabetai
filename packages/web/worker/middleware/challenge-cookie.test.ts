import { describe, expect, it } from "vitest";
import { sign } from "hono/jwt";
import { signChallengeToken, verifyChallengeToken } from "./challenge-cookie";

const secret = "0".repeat(64);
const nowSec = () => Math.floor(Date.now() / 1000);

describe("challenge token", () => {
  it("round-trips the signed state", async () => {
    const state = { kind: "invite", uid: "u", displayName: "d", inviteId: "i", spaceId: "s" } as const;
    const token = await signChallengeToken({ challenge: "c", state, exp: nowSec() + 300 }, secret);
    const p = await verifyChallengeToken(token, secret);
    expect(p?.challenge).toBe("c");
    expect(p?.state).toEqual(state);
  });
  it("rejects an expired token (hono/jwt verify enforces exp)", async () => {
    const token = await signChallengeToken(
      { challenge: "c", state: { kind: "authentication" }, exp: nowSec() - 1 },
      secret,
    );
    expect(await verifyChallengeToken(token, secret)).toBeNull();
  });
  it("rejects a token signed with another secret", async () => {
    const token = await signChallengeToken(
      { challenge: "c", state: { kind: "authentication" }, exp: nowSec() + 300 },
      "1".repeat(64),
    );
    expect(await verifyChallengeToken(token, secret)).toBeNull();
  });
  it("rejects a session token replayed as a challenge (aud differs)", async () => {
    const token = await sign({ sid: "x", aud: "matatabetai:session", exp: nowSec() + 300 }, secret);
    expect(await verifyChallengeToken(token, secret)).toBeNull();
  });
  it("rejects an unknown state kind even with a valid signature", async () => {
    const token = await sign(
      { challenge: "c", state: { kind: "admin" }, aud: "matatabetai:challenge", exp: nowSec() + 300 },
      secret,
    );
    expect(await verifyChallengeToken(token, secret)).toBeNull();
  });
});

import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { sign, verify } from "hono/jwt";
import { z } from "zod";
import type { AppEnv, SpaceEnv } from "../env";
import { challengeCookieName, cookieBase } from "../lib/cookies";

const TTL_SEC = 5 * 60;
// session JWT と aud を分ける: session トークンを challenge として流用できない
const AUD = "matatabetai:challenge";

// verify が必要とするものは全部ここに署名して入れる。id の類をクライアントから受け取らない。
const ChallengeState = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("authentication") }),
  z.object({ kind: z.literal("add-credential"), uid: z.string() }),
  z.object({ kind: z.literal("initial"), uid: z.string(), displayName: z.string() }),
  z.object({
    kind: z.literal("invite"),
    uid: z.string(),
    displayName: z.string(),
    inviteId: z.string(),
    spaceId: z.string(),
  }),
]);
export type ChallengeState = z.infer<typeof ChallengeState>;

const Payload = z.object({
  challenge: z.string(),
  state: ChallengeState,
  aud: z.literal(AUD),
  exp: z.number(),
});

type AnyEnv = AppEnv | SpaceEnv;

export async function issueChallenge(
  c: Context<AnyEnv>,
  challenge: string,
  state: ChallengeState,
  now = new Date(),
): Promise<void> {
  const exp = Math.floor(now.getTime() / 1000) + TTL_SEC;
  const token = await sign({ challenge, state, aud: AUD, exp }, c.env.SESSION_SECRET);
  setCookie(c, challengeCookieName(c.env.ORIGIN), token, {
    ...cookieBase(c.env.ORIGIN),
    maxAge: TTL_SEC,
  });
}

// 単回使用: 検証の前に cookie を消すので、失敗した verify を同じ challenge で再試行できない。
export async function consumeChallenge(
  c: Context<AnyEnv>,
): Promise<{ challenge: string; state: ChallengeState } | null> {
  const name = challengeCookieName(c.env.ORIGIN);
  const token = getCookie(c, name);
  deleteCookie(c, name, cookieBase(c.env.ORIGIN));
  if (!token) return null;
  const payload = await verifyChallengeToken(token, c.env.SESSION_SECRET);
  return payload ? { challenge: payload.challenge, state: payload.state } : null;
}

// hono/jwt の verify は署名と exp を見る（exp 切れは throw — 単体テストで固定）。
export async function verifyChallengeToken(
  token: string,
  secret: string,
): Promise<z.infer<typeof Payload> | null> {
  try {
    const raw = await verify(token, secret, { alg: "HS256", aud: AUD });
    const parsed = Payload.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function signChallengeToken(
  payload: { challenge: string; state: ChallengeState; exp: number },
  secret: string,
): Promise<string> {
  return sign({ ...payload, aud: AUD }, secret);
}

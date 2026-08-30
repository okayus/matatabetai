import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { sign, verify } from "hono/jwt";
import { z } from "zod";
import { sessions, users } from "../db/schema";
import { DisplayName, UserId } from "../domain/auth";
import { errorBody, errorStatus, type AppError } from "../domain/errors";
import type { AppEnv, SpaceEnv } from "../env";
import { cookieBase, sessionCookieName } from "../lib/cookies";
import { ensureDevSpace, loadMemberSpaceIds } from "./membership";

const SESSION_DAYS = 30;
export const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
const AUD = "matatabetai:session";

const SessionPayload = z.object({ sid: z.string(), aud: z.literal(AUD), exp: z.number() });

type AnyEnv = AppEnv | SpaceEnv;

export function isLocalOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  } catch {
    return false;
  }
}

// 残りが半分を切ったら延長する（有効な session 1 本あたり約 15 日に 1 回の書き込み）
export function shouldSlide(expiresMs: number, nowMs: number): boolean {
  return expiresMs - nowMs < SESSION_MS / 2;
}

async function writeSessionCookie(c: Context<AnyEnv>, sid: string, expiresAt: Date) {
  const token = await sign(
    { sid, aud: AUD, exp: Math.floor(expiresAt.getTime() / 1000) },
    c.env.SESSION_SECRET,
  );
  setCookie(c, sessionCookieName(c.env.ORIGIN), token, {
    ...cookieBase(c.env.ORIGIN),
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

function clearSessionCookie(c: Context<AnyEnv>) {
  deleteCookie(c, sessionCookieName(c.env.ORIGIN), cookieBase(c.env.ORIGIN));
}

function fail(c: Context<AnyEnv>, error: AppError) {
  return c.json(errorBody(error), errorStatus(error));
}

// register/verify・login/verify・credentials/add/verify が呼ぶ
export async function issueSession(c: Context<AnyEnv>, userId: UserId): Promise<void> {
  const db = drizzle(c.env.DB);
  const sid = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_MS);
  await db.insert(sessions).values({
    id: sid,
    userId,
    expiresAt: expiresAt.toISOString(),
    createdAt: now.toISOString(),
  });
  await writeSessionCookie(c, sid, expiresAt);
}

// logout: 行が真実なので消せば JWT は即座に死ぬ
export async function revokeSession(c: Context<AnyEnv>): Promise<void> {
  const token = getCookie(c, sessionCookieName(c.env.ORIGIN));
  if (token) {
    try {
      const payload = SessionPayload.parse(
        await verify(token, c.env.SESSION_SECRET, { alg: "HS256", aud: AUD }),
      );
      await drizzle(c.env.DB).delete(sessions).where(eq(sessions.id, payload.sid));
    } catch {
      // 壊れたトークン: 消すものがない
    }
  }
  clearSessionCookie(c);
}

export function sessionMiddleware() {
  return createMiddleware<AppEnv>(async (c, next) => {
    const db = drizzle(c.env.DB);

    // dev bypass は「値がある」かつ「ORIGIN がローカル」の両方が要る
    if (c.env.DEV_BYPASS_USER_ID && isLocalOrigin(c.env.ORIGIN)) {
      const devId = UserId.parse(c.env.DEV_BYPASS_USER_ID);
      const now = new Date().toISOString();
      await db
        .insert(users)
        .values({ id: devId, displayName: "dev", createdAt: now })
        .onConflictDoNothing();
      await ensureDevSpace(db, devId, now);
      c.set("userId", devId);
      c.set("displayName", DisplayName.parse("dev"));
      c.set("memberSpaceIds", await loadMemberSpaceIds(db, devId));
      await next();
      return;
    }
    if (c.env.DEV_BYPASS_USER_ID) {
      console.error("DEV_BYPASS_USER_ID is set on a non-local ORIGIN; ignoring");
    }

    const token = getCookie(c, sessionCookieName(c.env.ORIGIN));
    if (!token) return fail(c, { type: "unauthorized", message: "No session" });

    let sid: string;
    try {
      sid = SessionPayload.parse(
        await verify(token, c.env.SESSION_SECRET, { alg: "HS256", aud: AUD }),
      ).sid;
    } catch {
      return fail(c, { type: "unauthorized", message: "Invalid session token" });
    }

    const rows = await db
      .select({
        sid: sessions.id,
        expiresAt: sessions.expiresAt,
        userId: sessions.userId,
        displayName: users.displayName,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.id, sid));
    const row = rows[0];
    if (!row) {
      clearSessionCookie(c);
      return fail(c, { type: "session_expired" });
    }
    const nowMs = Date.now();
    const expiresMs = new Date(row.expiresAt).getTime();
    if (expiresMs < nowMs) {
      await db.delete(sessions).where(eq(sessions.id, row.sid));
      clearSessionCookie(c);
      return fail(c, { type: "session_expired" });
    }

    const userId = UserId.parse(row.userId);
    c.set("userId", userId);
    c.set("displayName", DisplayName.parse(row.displayName));
    c.set("memberSpaceIds", await loadMemberSpaceIds(db, userId));

    if (shouldSlide(expiresMs, nowMs)) {
      const newExpires = new Date(nowMs + SESSION_MS);
      await db
        .update(sessions)
        .set({ expiresAt: newExpires.toISOString() })
        .where(eq(sessions.id, row.sid));
      await writeSessionCookie(c, row.sid, newExpires);
    }

    await next();
  });
}

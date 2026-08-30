import { Hono } from "hono";
import { z } from "zod";
import { errorBody, errorStatus, parseWith, type AppError } from "../domain/errors";
import type { AppEnv } from "../env";
import { acceptInvite, validateInvite } from "../spaces/registration";

const AcceptInput = z.object({ token: z.string().min(1).max(256) });

// /api/invites/accept — ログイン済みユーザが別のスペースに参加する（spaceMiddleware の外）
export const inviteAcceptRoutes = new Hono<AppEnv>().post("/accept", async (c) => {
  const fail = (error: AppError) => c.json(errorBody(error), errorStatus(error));
  const parsed = parseWith(AcceptInput, await c.req.json().catch(() => undefined));
  if (parsed.isErr()) return fail({ type: "invite_invalid" });

  const now = new Date();
  const found = await validateInvite(c.env.DB, parsed.value.token, now);
  if (found.isErr()) return fail(found.error);

  // 既に member なら招待を燃やさない（同じ端末で別の家族が開いたのかもしれない）
  if (c.var.memberSpaceIds.includes(found.value.spaceId)) return fail({ type: "already_member" });

  const r = await acceptInvite(c.env.DB, found.value, c.var.userId, now.toISOString());
  if (r.isErr()) return fail(r.error);
  return c.json({ spaceId: r.value.spaceId }, 201);
});

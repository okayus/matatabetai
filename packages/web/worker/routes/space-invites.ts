import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono, type Context } from "hono";
import { invites } from "../db/schema";
import { errorBody, errorStatus, parseWith, type AppError } from "../domain/errors";
import { inviteExpiresAt, inviteUrl } from "../domain/invite";
import { InviteId } from "../domain/space";
import type { SpaceEnv } from "../env";
import { randomTokenHex, sha256Hex } from "../lib/token";
import { isOwner } from "../middleware/owner";

function fail(c: Context<SpaceEnv>, error: AppError) {
  return c.json(errorBody(error), errorStatus(error));
}

// /api/spaces/:spaceId/invites — すべて owner 限定
export const spaceInviteRoutes = new Hono<SpaceEnv>()
  .post("/", async (c) => {
    const db = drizzle(c.env.DB);
    if (!(await isOwner(db, c.var.userId, c.var.spaceId))) return fail(c, { type: "forbidden" });
    const token = randomTokenHex();
    const inviteId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = inviteExpiresAt(now);
    await db.insert(invites).values({
      id: inviteId,
      spaceId: c.var.spaceId,
      tokenHash: await sha256Hex(token),
      role: "member",
      expiresAt,
      createdByUserId: c.var.userId,
      createdAt: now.toISOString(),
    });
    console.log("[invites] issued", inviteId); // トークンは絶対にログに出さない
    return c.json({ inviteId, expiresAt, url: inviteUrl(c.env.ORIGIN, token) }, 201);
  })
  .get("/", async (c) => {
    const db = drizzle(c.env.DB);
    if (!(await isOwner(db, c.var.userId, c.var.spaceId))) return fail(c, { type: "forbidden" });
    const rows = await db
      .select({
        id: invites.id,
        expiresAt: invites.expiresAt,
        createdByUserId: invites.createdByUserId,
        createdAt: invites.createdAt,
      })
      .from(invites)
      .where(
        and(
          eq(invites.spaceId, c.var.spaceId),
          isNull(invites.consumedAt),
          gt(invites.expiresAt, new Date().toISOString()),
        ),
      )
      .orderBy(desc(invites.createdAt));
    return c.json(rows); // hash しか無いのでトークンは出しようがない
  })
  .delete("/:inviteId", async (c) => {
    const db = drizzle(c.env.DB);
    if (!(await isOwner(db, c.var.userId, c.var.spaceId))) return fail(c, { type: "forbidden" });
    const id = parseWith(InviteId, c.req.param("inviteId"));
    if (id.isErr()) return fail(c, { type: "not_found" });
    const deleted = await db
      .delete(invites)
      .where(and(eq(invites.id, id.value), eq(invites.spaceId, c.var.spaceId)))
      .returning({ id: invites.id });
    if (deleted.length === 0) return fail(c, { type: "not_found" });
    return c.json({});
  });

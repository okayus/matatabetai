import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono, type Context } from "hono";
import { spaceMembers, spaces } from "../db/schema";
import { UserId } from "../domain/auth";
import { errorBody, errorStatus, parseWith, type AppError } from "../domain/errors";
import { RenameSpaceInput } from "../domain/space";
import type { SpaceEnv } from "../env";
import { isLastOwner, isOwner } from "../middleware/owner";
import { listMembers } from "../spaces/queries";

function fail(c: Context<SpaceEnv>, error: AppError) {
  return c.json(errorBody(error), errorStatus(error));
}

// /api/spaces/:spaceId — spaceMiddleware が所属を証明済み。owner 判定は handler ごと。
export const spaceDetailRoutes = new Hono<SpaceEnv>()
  .get("/", async (c) => {
    const db = drizzle(c.env.DB);
    const [space] = await db
      .select({ id: spaces.id, name: spaces.name, createdAt: spaces.createdAt })
      .from(spaces)
      .where(eq(spaces.id, c.var.spaceId));
    if (!space) return fail(c, { type: "not_found" });
    const members = await listMembers(db, c.var.spaceId);
    const me = members.find((m) => m.userId === c.var.userId);
    return c.json({ ...space, role: me?.role ?? "member", members });
  })
  .patch("/", async (c) => {
    const db = drizzle(c.env.DB);
    if (!(await isOwner(db, c.var.userId, c.var.spaceId))) return fail(c, { type: "forbidden" });
    const parsed = parseWith(RenameSpaceInput, await c.req.json().catch(() => undefined));
    if (parsed.isErr()) return fail(c, parsed.error);
    await db.update(spaces).set({ name: parsed.value.name }).where(eq(spaces.id, c.var.spaceId));
    return c.json({ id: c.var.spaceId, name: parsed.value.name });
  })
  .get("/members", async (c) => c.json(await listMembers(drizzle(c.env.DB), c.var.spaceId)))
  // owner が誰かを外す、または自分が抜ける（member でも可）。最後の owner は外せない
  .delete("/members/:userId", async (c) => {
    const target = parseWith(UserId, c.req.param("userId"));
    if (target.isErr()) return fail(c, { type: "not_found" });
    const db = drizzle(c.env.DB);
    const self = target.value === c.var.userId;
    if (!self && !(await isOwner(db, c.var.userId, c.var.spaceId))) {
      return fail(c, { type: "forbidden" });
    }
    if (await isLastOwner(db, c.var.spaceId, target.value)) return fail(c, { type: "last_owner" });
    const deleted = await db
      .delete(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, c.var.spaceId), eq(spaceMembers.userId, target.value)))
      .returning({ userId: spaceMembers.userId });
    if (deleted.length === 0) return fail(c, { type: "not_found" });
    return c.json({});
  });

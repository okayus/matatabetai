import { createMiddleware } from "hono/factory";
import { SpaceId } from "../domain/space";
import type { SpaceEnv } from "../env";

// 不正な id も、存在しない id も、所属外の id も同じ本文。403 は存在を教えてしまう。
// console.error は残す（e2e の 404 を診断する唯一の手がかり）。本文には理由を出さない。
export const spaceMiddleware = createMiddleware<SpaceEnv>(async (c, next) => {
  const raw = c.req.param("spaceId") ?? "";
  const parsed = SpaceId.safeParse(raw);
  if (!parsed.success) {
    console.error("[spaceMiddleware] 404: malformed spaceId", raw);
    return c.json({ error: { type: "not_found" } }, 404);
  }
  if (!c.var.memberSpaceIds.includes(parsed.data)) {
    console.error("[spaceMiddleware] 404: not a member", parsed.data, c.var.userId);
    return c.json({ error: { type: "not_found" } }, 404);
  }
  c.set("spaceId", parsed.data);
  await next();
});

import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { errorBody, errorStatus, parseWith } from "../domain/errors";
import { CreateSpaceInput } from "../domain/space";
import type { AppEnv } from "../env";
import { listMySpaces } from "../spaces/queries";
import { createOwnedSpace } from "../spaces/registration";

// /api/spaces — 一覧と「自分のスペースを 1 つ作る」。spaceMiddleware の外。
export const mySpacesRoutes = new Hono<AppEnv>()
  .get("/", async (c) => c.json(await listMySpaces(drizzle(c.env.DB), c.var.userId)))
  .post("/", async (c) => {
    const parsed = parseWith(CreateSpaceInput, await c.req.json().catch(() => undefined));
    if (parsed.isErr()) return c.json(errorBody(parsed.error), errorStatus(parsed.error));
    const r = await createOwnedSpace(
      c.env.DB,
      c.var.userId,
      parsed.value.name,
      new Date().toISOString(),
    );
    if (r.isErr()) return c.json(errorBody(r.error), errorStatus(r.error));
    return c.json({ id: r.value.spaceId, name: parsed.value.name }, 201);
  });

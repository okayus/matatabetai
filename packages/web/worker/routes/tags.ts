import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import type { SpaceEnv } from "../env";
import { listSpaceTags } from "../meals/queries";

// /api/spaces/:spaceId/tags — サジェストの絞り込み候補になる語彙。
// spaceMiddleware の内側なので、他スペースのタグは存在ごと見えない
export const tagRoutes = new Hono<SpaceEnv>().get("/", async (c) =>
  c.json(await listSpaceTags(drizzle(c.env.DB), c.var.spaceId)),
);

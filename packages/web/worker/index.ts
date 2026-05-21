import { Hono } from "hono";
import type { Bindings } from "./types";

const app = new Hono<{ Bindings: Bindings }>();

app.get("/health", (c) => c.json({ status: "ok" }));

app.notFound(async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  return new Response(res.body, res);
});

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Bindings>;

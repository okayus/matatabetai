import { Hono } from "hono";

// Env は wrangler types が wrangler.jsonc から生成する global（worker-configuration.d.ts）
const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ status: "ok" }));

app.notFound(async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  return new Response(res.body, res);
});

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;

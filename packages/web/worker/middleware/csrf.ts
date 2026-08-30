import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";

// SameSite=Lax がナビゲーション由来の cross-site POST を止め、これが残りを閉じる。
// GET / HEAD / OPTIONS は免除（e2e の API 読み取りが Cookie ヘッダだけで通る）。
export const csrfOriginCheck = createMiddleware<AppEnv>(async (c, next) => {
  const m = c.req.method;
  if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS") {
    const origin = c.req.header("Origin");
    if (!origin || origin !== c.env.ORIGIN) {
      return c.json({ error: { type: "csrf_origin_mismatch" } }, 403);
    }
  }
  await next();
});

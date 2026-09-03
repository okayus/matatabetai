import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { AppEnv, SpaceEnv } from "./env";
import { isHttps } from "./lib/cookies";
import { securityHeaderOptions } from "./lib/csp";
import { csrfOriginCheck } from "./middleware/csrf";
import { sessionMiddleware } from "./middleware/session";
import { spaceMiddleware } from "./middleware/space";
import { authRoutes } from "./routes/auth";
import { inviteAcceptRoutes } from "./routes/invite-accept";
import { mealLinkPreviewRoutes } from "./routes/meal-link-previews";
import { mealPhotoRoutes } from "./routes/meal-photos";
import { mealRoutes } from "./routes/meals";
import { spaceDetailRoutes } from "./routes/space-detail";
import { spaceInviteRoutes } from "./routes/space-invites";
import { tagRoutes } from "./routes/tags";
import { mySpacesRoutes } from "./routes/spaces";

const app = new Hono<AppEnv>();

// CSP はスキームで決まる（本番 https は inline なし）。ORIGIN は deploy 単位で不変なので 1 度だけ作る
const headersFor = { https: secureHeaders(securityHeaderOptions(true)), http: secureHeaders(securityHeaderOptions(false)) };
app.use("*", (c, next) => (isHttps(c.env.ORIGIN) ? headersFor.https : headersFor.http)(c, next));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: { type: "internal" } }, 500);
});

app.get("/health", (c) => c.json({ status: "ok" }));

const api = new Hono<AppEnv>();
api.use("*", csrfOriginCheck);

// 1. 公開ルート（register / login）を先に。authRoutes は必要な route だけ自分で sessionMiddleware を付ける
api.route("/auth", authRoutes);

// 2. 残りは session の内側。`/*` は /auth/* にも一致するが、上で先に登録した handler が先に応える
const protectedApi = new Hono<AppEnv>();
protectedApi.use("/*", sessionMiddleware());
protectedApi.route("/spaces", mySpacesRoutes); // 一覧・作成は spaceMiddleware の外
protectedApi.route("/invites", inviteAcceptRoutes); // accept も外

const space = new Hono<SpaceEnv>();
space.use("*", spaceMiddleware); // 以下は所属が要る
space.route("/", spaceDetailRoutes);
space.route("/invites", spaceInviteRoutes);
space.route("/meals", mealRoutes);
space.route("/meals/:mealId/photos", mealPhotoRoutes);
space.route("/meals/:mealId/link-previews", mealLinkPreviewRoutes);
space.route("/tags", tagRoutes);
protectedApi.route("/spaces/:spaceId", space);

// 未知の /api/* に SPA の index.html を返さない
protectedApi.all("*", (c) => c.json({ error: { type: "not_found" } }, 404));
api.route("/", protectedApi);
app.route("/api", api);

// SPA fallback（静的ファイルと index.html は ASSETS が返す）
app.notFound(async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  return new Response(res.body, res);
});

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;

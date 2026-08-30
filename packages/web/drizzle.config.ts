import { defineConfig } from "drizzle-kit";

// migration の生成専用（適用は wrangler d1 migrations apply）。
// `pnpm db:generate -- --name <summary>` → drizzle/NNNN_<summary>.sql + meta/。
// 生成 SQL に CREATE TABLE __new_* / DROP TABLE が出たら skill cloudflare-d1-drizzle-migration を読む。
export default defineConfig({
  dialect: "sqlite",
  schema: "./worker/db/schema.ts",
  out: "./drizzle",
});

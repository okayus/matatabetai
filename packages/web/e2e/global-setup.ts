import { execFileSync } from "node:child_process";
import { executeLocalSql, resetLocalDb } from "./helpers/db";

// 別の家族。spec はこの id を直接叩いて 404 を確かめる（存在するのに見えない、が要点）
export const OTHER_USER_ID = "00000000-0000-4000-8000-000000000099";
export const OTHER_SPACE_ID = "00000000-0000-4000-8000-000000000098";

export default function globalSetup(): void {
  // migration をローカル state に適用（冪等）してから全消し → 他家族を seed
  execFileSync("pnpm", ["exec", "wrangler", "d1", "migrations", "apply", "matatabetai", "--local", "--persist-to", ".wrangler/state"], {
    stdio: "pipe",
  });
  resetLocalDb();
  const t = "2026-01-01T00:00:00.000Z";
  executeLocalSql(
    [
      `INSERT INTO users (id, display_name, created_at) VALUES ('${OTHER_USER_ID}', 'other', '${t}')`,
      `INSERT INTO spaces (id, name, created_at) VALUES ('${OTHER_SPACE_ID}', 'other family', '${t}')`,
      `INSERT INTO space_members (space_id, user_id, role, created_at) VALUES ('${OTHER_SPACE_ID}', '${OTHER_USER_ID}', 'owner', '${t}')`,
    ].join("; "),
  );
}

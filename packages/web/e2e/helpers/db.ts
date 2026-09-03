import { execFileSync } from "node:child_process";

// `--local` は決め打ち: このヘルパーが本番 D1 に触れる経路を作らない。
// state の場所は e2e:server の --persist-to と同じ cwd 相対 .wrangler/state。
export function executeLocalSql(sql: string): void {
  execFileSync(
    "pnpm",
    ["exec", "wrangler", "d1", "execute", "matatabetai", "--local", "--persist-to", ".wrangler/state", "--command", sql],
    { stdio: "pipe" },
  );
}

// e2e は dev データを消す前提（CLAUDE.md テスト方針）。FK 順の逆に消す
export function resetLocalDb(): void {
  executeLocalSql(
    [
      "DELETE FROM meal_tags",
      "DELETE FROM meal_link_previews",
      "DELETE FROM meals",
      "DELETE FROM tags",
      "DELETE FROM invites",
      "DELETE FROM sessions",
      "DELETE FROM credentials",
      "DELETE FROM space_members",
      "DELETE FROM spaces",
      "DELETE FROM users",
    ].join("; "),
  );
}

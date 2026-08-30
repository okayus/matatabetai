import { eq } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/d1";
import { spaceMembers, spaces } from "../db/schema";
import type { UserId } from "../domain/auth";
import { SpaceId } from "../domain/space";

type Db = ReturnType<typeof drizzle>;

export async function loadMemberSpaceIds(db: Db, userId: UserId): Promise<SpaceId[]> {
  const rows = await db
    .select({ spaceId: spaceMembers.spaceId })
    .from(spaceMembers)
    .where(eq(spaceMembers.userId, userId));
  return rows.map((r) => SpaceId.parse(r.spaceId));
}

// dev bypass 専用: bypass ユーザが必ず owner でいる固定スペース。memberSpaceIds を空にしない。
export const DEV_SPACE_ID = "00000000-0000-4000-8000-000000000001";

export async function ensureDevSpace(db: Db, userId: UserId, now: string): Promise<void> {
  await db
    .insert(spaces)
    .values({ id: DEV_SPACE_ID, name: "dev の食卓", createdAt: now })
    .onConflictDoNothing();
  await db
    .insert(spaceMembers)
    .values({ spaceId: DEV_SPACE_ID, userId, role: "owner", createdAt: now })
    .onConflictDoNothing();
}

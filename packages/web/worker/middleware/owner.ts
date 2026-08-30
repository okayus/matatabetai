import { and, count, eq } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/d1";
import { spaceMembers } from "../db/schema";

type Db = ReturnType<typeof drizzle>;

// owner 判定は handler の中で呼ぶ（同じ prefix に member 権限の GET があるので middleware にしない）
export async function isOwner(db: Db, userId: string, spaceId: string): Promise<boolean> {
  const rows = await db
    .select({ role: spaceMembers.role })
    .from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)));
  return rows[0]?.role === "owner";
}

// targetUserId を外すとスペースに owner がいなくなるか
export async function isLastOwner(db: Db, spaceId: string, targetUserId: string): Promise<boolean> {
  const target = await db
    .select({ role: spaceMembers.role })
    .from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, targetUserId)));
  if (target[0]?.role !== "owner") return false;
  const owners = await db
    .select({ n: count() })
    .from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.role, "owner")));
  return (owners[0]?.n ?? 0) <= 1;
}

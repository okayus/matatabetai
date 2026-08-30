import { eq, sql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/d1";
import { spaceMembers, spaces, users } from "../db/schema";
import type { UserId } from "../domain/auth";
import type { Role } from "../domain/space";

type Db = ReturnType<typeof drizzle>;

export type SpaceSummary = {
  id: string;
  name: string;
  role: Role;
  memberCount: number;
  createdAt: string;
};

export async function listMySpaces(db: Db, userId: UserId): Promise<SpaceSummary[]> {
  return db
    .select({
      id: spaces.id,
      name: spaces.name,
      role: spaceMembers.role,
      memberCount: sql<number>`(SELECT COUNT(*) FROM space_members sm WHERE sm.space_id = ${spaces.id})`,
      createdAt: spaces.createdAt,
    })
    .from(spaceMembers)
    .innerJoin(spaces, eq(spaceMembers.spaceId, spaces.id))
    .where(eq(spaceMembers.userId, userId))
    .orderBy(spaces.createdAt);
}

export type MemberSummary = {
  userId: string;
  displayName: string;
  role: Role;
  joinedAt: string;
};

export async function listMembers(db: Db, spaceId: string): Promise<MemberSummary[]> {
  return db
    .select({
      userId: spaceMembers.userId,
      displayName: users.displayName,
      role: spaceMembers.role,
      joinedAt: spaceMembers.createdAt,
    })
    .from(spaceMembers)
    .innerJoin(users, eq(spaceMembers.userId, users.id))
    .where(eq(spaceMembers.spaceId, spaceId))
    .orderBy(spaceMembers.createdAt);
}


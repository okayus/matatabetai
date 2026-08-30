import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { err, ok, type Result } from "neverthrow";
import { invites, type NewCredential, type NewUser } from "../db/schema";
import type { UserId } from "../domain/auth";
import type { AppError } from "../domain/errors";
import { inviteUsability, isInviteTokenShape, type UsableInvite } from "../domain/invite";
import { defaultSpaceName, type SpaceId, type SpaceName } from "../domain/space";
import { sha256Hex } from "../lib/token";
import type { ChallengeState } from "../middleware/challenge-cookie";

// 登録・招待消費の書き込みは生の D1 binding で batch する: 文ごとの meta.changes が要る。
// 読みは Drizzle。

export type InviteState = Extract<ChallengeState, { kind: "invite" }>;

// register/begin と POST /api/invites/accept: このトークンはいま使えるか
export async function validateInvite(
  d1: D1Database,
  token: string,
  now: Date,
): Promise<Result<UsableInvite, AppError>> {
  if (!isInviteTokenShape(token)) return err({ type: "invite_invalid" });
  const rows = await drizzle(d1)
    .select({
      id: invites.id,
      spaceId: invites.spaceId,
      expiresAt: invites.expiresAt,
      consumedAt: invites.consumedAt,
    })
    .from(invites)
    .where(eq(invites.tokenHash, await sha256Hex(token)));
  return inviteUsability(rows[0], now);
}

// INITIAL_REGISTRATION_TOKEN 経路: owner + 最初のスペース + パスキーを 1 batch で。
// session 行は含めない（呼び出し側の issueSession が後で足す）。
export async function registerInitialUser(
  d1: D1Database,
  user: NewUser,
  cred: NewCredential,
): Promise<{ spaceId: string }> {
  const spaceId = crypto.randomUUID();
  await d1.batch([
    userInsert(d1, user),
    d1
      .prepare("INSERT INTO spaces (id, name, created_at) VALUES (?, ?, ?)")
      .bind(spaceId, defaultSpaceName(user.displayName), user.createdAt),
    d1
      .prepare(
        "INSERT INTO space_members (space_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)",
      )
      .bind(spaceId, user.id, user.createdAt),
    credentialInsert(d1, cred),
  ]);
  return { spaceId };
}

// 招待経路: member + パスキー + 招待の消費を 1 batch で、レースにも安全に。
export async function registerInvitedUser(
  d1: D1Database,
  state: InviteState,
  user: NewUser,
  cred: NewCredential,
): Promise<Result<{ spaceId: string }, AppError>> {
  const results = await d1.batch([
    userInsert(d1, user),
    d1
      .prepare(
        "INSERT INTO space_members (space_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)",
      )
      .bind(state.spaceId, user.id, user.createdAt),
    credentialInsert(d1, cred),
    // 最後: 行数に意味がある唯一の文
    consumeInviteStatement(d1, state.inviteId, user.id, user.createdAt),
  ]);
  if (changesOfLast(results) === 0) {
    // begin と verify の間に誰かが同じ招待を使った。batch は原子的だが 0 行 UPDATE は
    // エラーではないので、入った行を逆順で戻す。
    await d1.batch([
      d1.prepare("DELETE FROM credentials WHERE user_id = ?").bind(user.id),
      d1.prepare("DELETE FROM space_members WHERE user_id = ?").bind(user.id),
      d1.prepare("DELETE FROM users WHERE id = ?").bind(user.id),
    ]);
    return err({ type: "invite_race" });
  }
  return ok({ spaceId: state.spaceId });
}

// ログイン済みユーザが別のスペースに参加する（招待の消費は同じ規則）
export async function acceptInvite(
  d1: D1Database,
  invite: UsableInvite,
  userId: UserId,
  now: string,
): Promise<Result<{ spaceId: SpaceId }, AppError>> {
  const results = await d1.batch([
    d1
      .prepare(
        "INSERT INTO space_members (space_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)",
      )
      .bind(invite.spaceId, userId, now),
    consumeInviteStatement(d1, invite.id, userId, now),
  ]);
  if (changesOfLast(results) === 0) {
    await d1
      .prepare("DELETE FROM space_members WHERE space_id = ? AND user_id = ?")
      .bind(invite.spaceId, userId)
      .run();
    return err({ type: "invite_race" });
  }
  return ok({ spaceId: invite.spaceId });
}

// 自分のスペースを 1 つ作る。「owner のスペースをまだ持たない」条件を INSERT 自体に入れて
// 同時実行でも 2 つ作れないようにする（0 行なら already_owner）。
export async function createOwnedSpace(
  d1: D1Database,
  userId: UserId,
  name: SpaceName,
  now: string,
): Promise<Result<{ spaceId: string }, AppError>> {
  const spaceId = crypto.randomUUID();
  const results = await d1.batch([
    d1
      .prepare(
        "INSERT INTO spaces (id, name, created_at) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM space_members WHERE user_id = ? AND role = 'owner')",
      )
      .bind(spaceId, name, now, userId),
    d1
      .prepare(
        "INSERT INTO space_members (space_id, user_id, role, created_at) SELECT ?, ?, 'owner', ? WHERE EXISTS (SELECT 1 FROM spaces WHERE id = ?)",
      )
      .bind(spaceId, userId, now, spaceId),
  ]);
  if ((results[0]?.meta.changes ?? 0) === 0) return err({ type: "already_owner" });
  return ok({ spaceId });
}

function userInsert(d1: D1Database, user: NewUser): D1PreparedStatement {
  return d1
    .prepare("INSERT INTO users (id, display_name, created_at) VALUES (?, ?, ?)")
    .bind(user.id, user.displayName, user.createdAt);
}

function credentialInsert(d1: D1Database, cred: NewCredential): D1PreparedStatement {
  return d1
    .prepare(
      "INSERT INTO credentials (id, user_id, public_key, counter, transports, device_name, backed_up, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      cred.id,
      cred.userId,
      cred.publicKey,
      cred.counter,
      cred.transports ?? null,
      cred.deviceName ?? null,
      cred.backedUp ? 1 : 0,
      cred.createdAt,
      cred.lastUsedAt ?? null,
    );
}

function consumeInviteStatement(
  d1: D1Database,
  inviteId: string,
  userId: string,
  now: string,
): D1PreparedStatement {
  return d1
    .prepare(
      "UPDATE invites SET consumed_at = ?, consumed_by_user_id = ? WHERE id = ? AND consumed_at IS NULL",
    )
    .bind(now, userId, inviteId);
}

function changesOfLast(results: D1Result<unknown>[]): number {
  return results[results.length - 1]?.meta.changes ?? 0;
}

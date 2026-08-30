import { err, ok, type Result } from "neverthrow";
import { z } from "zod";
import type { AppError } from "./errors";
import { InviteId, SpaceId } from "./space";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// 32 bytes の乱数 → hex。DB には sha256 だけを置く
export const InviteToken = z.string().regex(/^[0-9a-f]{64}$/);

export function isInviteTokenShape(token: string): boolean {
  return InviteToken.safeParse(token).success;
}

export type InviteRow = {
  id: string;
  spaceId: string;
  expiresAt: string;
  consumedAt: string | null;
};

export type UsableInvite = { id: InviteId; spaceId: SpaceId };

// 「このトークンはいま使えるか」。consumed を expired より先に見る:
// 使われたリンクをもう一度開いた家族には「使用済み」が正しい説明になる。
export function inviteUsability(
  row: InviteRow | undefined,
  now: Date,
): Result<UsableInvite, AppError> {
  if (!row) return err({ type: "invite_invalid" });
  if (row.consumedAt !== null) return err({ type: "invite_consumed" });
  if (new Date(row.expiresAt).getTime() <= now.getTime()) return err({ type: "invite_expired" });
  return ok({ id: InviteId.parse(row.id), spaceId: SpaceId.parse(row.spaceId) });
}

export function inviteExpiresAt(now: Date): string {
  return new Date(now.getTime() + INVITE_TTL_MS).toISOString();
}

// トークンは URL のフラグメントに置く: サーバーログにも Referer にも乗らない
export function inviteUrl(origin: string, token: string): string {
  return `${origin}/invite#token=${token}`;
}

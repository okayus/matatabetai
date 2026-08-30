import { z } from "zod";

export type SpaceId = string & { readonly __brand: unique symbol };
export const SpaceId = z.uuid().transform((v) => v as SpaceId);

export type InviteId = string & { readonly __brand: unique symbol };
export const InviteId = z.uuid().transform((v) => v as InviteId);

export type SpaceName = string & { readonly __brand: unique symbol };
export const SpaceName = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[^\p{Cc}]*$/u, "制御文字は使えません")
  .transform((v) => v as SpaceName);

export type Role = "owner" | "member";
export const Role = z.enum(["owner", "member"]);

export const CreateSpaceInput = z.object({ name: SpaceName });
export const RenameSpaceInput = z.object({ name: SpaceName });

// 初回登録で作るスペースの既定名。表示名 ≤ 32 文字なので 40 文字に収まる
export function defaultSpaceName(displayName: string): SpaceName {
  return `${displayName}の食卓` as SpaceName;
}

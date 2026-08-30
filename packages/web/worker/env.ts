import type { DisplayName, UserId } from "./domain/auth";
import type { SpaceId } from "./domain/space";

// `Env` は `wrangler types` が wrangler.jsonc から生成する global（bindings + vars）。
// secret は wrangler.jsonc に無いのでここで宣言する。ローカルに .dev.vars があると
// `wrangler types` は同じキーを `string` で Env にも出すが、交差型なので矛盾しない。
export type Secrets = {
  // openssl rand -hex 32。session JWT と challenge cookie の両方に署名する
  SESSION_SECRET: string;
  // 初回 owner 登録のときだけ `wrangler secret put` し、登録が済んだら delete する
  INITIAL_REGISTRATION_TOKEN?: string;
  // .dev.vars 専用。ORIGIN が localhost のときだけ効く（session.ts の twin guard）
  DEV_BYPASS_USER_ID?: string;
};

export type Bindings = Env & Secrets;

export type SessionVars = {
  userId: UserId;
  displayName: DisplayName;
  // 毎リクエスト space_members から引く（JWT には入れない: 除名が次のリクエストで効く）
  memberSpaceIds: readonly SpaceId[];
};

export type AppEnv = { Bindings: Bindings; Variables: SessionVars };
export type SpaceEnv = { Bindings: Bindings; Variables: SessionVars & { spaceId: SpaceId } };

import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// すべて TEXT id（crypto.randomUUID）と ISO-8601 TEXT の時刻。
// users は CASCADE 子（credentials / sessions / space_members）を持つ親。後から users を
// 作り直す migration は D1 の CASCADE 事故（skill cloudflare-d1-drizzle-migration）になるので
// 列は最初に決め切る。

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  createdAt: text("created_at").notNull(),
});

export const credentials = sqliteTable(
  "credentials",
  {
    // WebAuthn credential id（base64url）。login は response.id で引くので主キー
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // COSE 公開鍵を base64url で保存（dump / d1 execute で読める）
    publicKey: text("public_key").notNull(),
    // 同期パスキー（iCloud / Google PM）はずっと 0
    counter: integer("counter").notNull(),
    // AuthenticatorTransportFuture[] の JSON、または null
    transports: text("transports"),
    // 端末一覧に出す利用者入力のラベル
    deviceName: text("device_name"),
    // registrationInfo.credentialBackedUp — 端末を失っても残るか
    backedUp: integer("backed_up", { mode: "boolean" }).notNull(),
    createdAt: text("created_at").notNull(),
    lastUsedAt: text("last_used_at"),
  },
  (t) => [index("credentials_user_id_idx").on(t.userId)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    // session JWT の sid。行が真実で、消せば JWT は即無効
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("sessions_user_id_idx").on(t.userId),
    index("sessions_expires_at_idx").on(t.expiresAt),
  ],
);

export const spaces = sqliteTable("spaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
});

export const spaceMembers = sqliteTable(
  "space_members",
  {
    spaceId: text("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "member"] }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.spaceId, t.userId] }),
    // sessionMiddleware が毎リクエスト WHERE user_id = ? を打つ
    index("space_members_user_id_idx").on(t.userId),
    check("space_members_role_check", sql`${t.role} IN ('owner', 'member')`),
  ],
);

export const invites = sqliteTable(
  "invites",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    // 平文トークンの sha256 hex。平文は発行レスポンスと招待リンクにしか存在しない
    tokenHash: text("token_hash").notNull(),
    // 招待で owner は作らない（昇格は ops の SQL）
    role: text("role", { enum: ["member"] }).notNull(),
    expiresAt: text("expires_at").notNull(),
    consumedAt: text("consumed_at"),
    // 監査用: 使った人が退会しても「使われた」事実は残す
    consumedByUserId: text("consumed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("invites_token_hash_uniq").on(t.tokenHash),
    index("invites_space_id_idx").on(t.spaceId),
    check("invites_role_check", sql`${t.role} = 'member'`),
  ],
);

export type NewUser = typeof users.$inferInsert;
export type NewCredential = typeof credentials.$inferInsert;

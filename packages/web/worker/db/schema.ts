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

// meals は meal_tags（CASCADE 子）の親。後から meals を作り直す migration は D1 の CASCADE 事故
// （skill cloudflare-d1-drizzle-migration）になるので、列と CHECK は最初に決め切る。
// meal_type に CHECK を付けないのは意図: 値の追加が table rebuild になるのを避け、enum は zod 境界で守る。
// リンク・メモは recipe_url / shop_url / recipe_text の独立 3 項目（ADR-007）。
export const meals = sqliteTable(
  "meals",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    // 表示は入力そのまま、集計・サジェストは name_normalized（NFKC + trim + 小文字）
    name: text("name").notNull(),
    nameNormalized: text("name_normalized").notNull(),
    // JST の日付文字列 YYYY-MM-DD。時刻は持たない
    eatenOn: text("eaten_on").notNull(),
    mealType: text("meal_type", { enum: ["breakfast", "lunch", "dinner", "snack"] }),
    // 凍結列（ADR-007 §2）。旧 RecipeSource DU の平坦化の名残で、meals_recipe_source_check を
    // 満たすためだけに書き続ける（CHECK を外す = table rebuild で D1 の CASCADE 事故）。
    // 掃除は Phase 4 のバックアップ整備後に別 migration で行う
    recipeSourceType: text("recipe_source_type", { enum: ["url", "text", "none"] }).notNull(),
    url: text("url"),
    // 作り方メモ（旧「自作レシピ」）。列は recipe_text をそのまま再利用する（ADR-007 §1）
    recipeMemo: text("recipe_text"),
    note: text("note"),
    mataTabetai: integer("mata_tabetai", { mode: "boolean" }).notNull(),
    // 表示・監査用。認可軸ではない（境界は space_id）。user 削除で投稿を消さないので cascade にしない
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    // レシピ URL と お店・商品 URL。作り方メモと合わせた独立 3 項目で、排他ではなく併用できる
    // （ADR-007 §1）。ADD COLUMN は末尾に付くので、物理順どおりここに並べる
    recipeUrl: text("recipe_url"),
    shopUrl: text("shop_url"),
  },
  (t) => [
    // 一覧は WHERE space_id = ? ORDER BY eaten_on DESC
    index("meals_space_id_eaten_on_idx").on(t.spaceId, t.eatenOn),
    check(
      "meals_recipe_source_check",
      sql`(${t.recipeSourceType} = 'url' AND ${t.url} IS NOT NULL AND ${t.recipeMemo} IS NULL) OR (${t.recipeSourceType} = 'text' AND ${t.recipeMemo} IS NOT NULL AND ${t.url} IS NULL) OR (${t.recipeSourceType} = 'none' AND ${t.url} IS NULL AND ${t.recipeMemo} IS NULL)`,
    ),
  ],
);

// 写真は meals の CASCADE 子。space_id は持たず親経由で属する（認可境界は meals.space_id）。
// バイト列は R2（private bucket、キーは photos/<spaceId>/<mealId>/<photoId>、拡張子なし）で、
// content_type はアップロード時に magic bytes で判定した値。width/height はクライアントの
// canvas 縮小結果なので必ずある（<img> の寸法予約に使う）。
export const mealPhotos = sqliteTable(
  "meal_photos",
  {
    id: text("id").primaryKey(),
    mealId: text("meal_id")
      .notNull()
      .references(() => meals.id, { onDelete: "cascade" }),
    r2Key: text("r2_key").notNull(),
    // 320px サムネ（<r2_key>/w320）。生成できなかった端末からの投稿は null で本体に fallback
    thumbKey: text("thumb_key"),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    // 表示・監査用。認可軸ではない（meals.created_by と同じ扱い）
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("meal_photos_meal_id_idx").on(t.mealId)],
);

// URL プレビュー（ADR-007 §3-4）。meals の CASCADE 子で、投稿時点のスナップショットを持つ。
// 行は投稿と同じ batch で status='pending' として作り、waitUntil の取得が 'ok' / 'failed' に更新する。
// og:image は hotlink せず Worker が取り込んで private R2（ogp/<spaceId>/<mealId>/<kind>）に置き、
// この列はそのキーだけを持つ。表示時に外部へ出ないので、リンク切れでもカードは残る。
// meal_type と違って CHECK を付けてよい: この表は CASCADE の子を持たないので、
// 値が増えて table rebuild になっても消えるものが無い（meals とはそこが違う）。
export const mealLinkPreviews = sqliteTable(
  "meal_link_previews",
  {
    mealId: text("meal_id")
      .notNull()
      .references(() => meals.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["recipe", "shop"] }).notNull(),
    // 取得した時点の URL（meals 側が編集されても、このカードが何を指していたかは動かない）
    url: text("url").notNull(),
    status: text("status", { enum: ["pending", "ok", "failed"] }).notNull(),
    title: text("title"),
    description: text("description"),
    siteName: text("site_name"),
    imageR2Key: text("image_r2_key"),
    // 取得が終わった時刻（pending の間は null）
    fetchedAt: text("fetched_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    // 1 投稿につき kind ごとに 1 行。一覧は WHERE meal_id IN (…) なので PK の先頭列で引ける
    primaryKey({ columns: [t.mealId, t.kind] }),
    check("meal_link_previews_kind_check", sql`${t.kind} IN ('recipe', 'shop')`),
    check(
      "meal_link_previews_status_check",
      sql`${t.status} IN ('pending', 'ok', 'failed')`,
    ),
  ],
);

// 食材タグ。スペース単位で name_normalized が一意（表示名は最初に登録した表記が勝つ）
export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    nameNormalized: text("name_normalized").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("tags_space_id_name_normalized_uniq").on(t.spaceId, t.nameNormalized)],
);

export const mealTags = sqliteTable(
  "meal_tags",
  {
    mealId: text("meal_id")
      .notNull()
      .references(() => meals.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.mealId, t.tagId] }),
    // タグ検索（AND）は tag_id から meal を引く
    index("meal_tags_tag_id_idx").on(t.tagId),
  ],
);

export type NewUser = typeof users.$inferInsert;
export type NewCredential = typeof credentials.$inferInsert;

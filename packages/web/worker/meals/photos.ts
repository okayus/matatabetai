import { and, asc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { mealPhotos, meals } from "../db/schema";
import type { UserId } from "../domain/auth";
import type { MealId } from "../domain/meal";
import { photoKeys, type AllowedImageType, type MealPhotoId } from "../domain/photo";
import type { SpaceId } from "../domain/space";

type Db = ReturnType<typeof drizzle>;

// 一覧・作成レスポンスに載せる形。URL はクライアントが id から組む（他リソースと同じ流儀）
export type MealPhotoSummary = {
  id: string;
  width: number;
  height: number;
  hasThumb: boolean;
  createdAt: string;
};

// meal を引く文は必ず space_id も比較する（別スペースの meal id を当てても存在しない扱い）
export async function mealExists(db: Db, spaceId: SpaceId, mealId: MealId): Promise<boolean> {
  const rows = await db
    .select({ id: meals.id })
    .from(meals)
    .where(and(eq(meals.id, mealId), eq(meals.spaceId, spaceId)));
  return rows.length > 0;
}

export type ImageBytes = { bytes: Uint8Array; contentType: AllowedImageType };

export type UploadPhotoInput = {
  full: ImageBytes;
  thumb: ImageBytes | null;
  width: number;
  height: number;
};

// put → INSERT の順（skill cloudflare-r2-private-image-upload）。行だけあって object が無い状態は
// 恒久的な 404 になるが、object だけ残る状態はこの場で補償削除できる。INSERT が落ちたら
// 置いたばかりの object を消してから投げ直す
export async function uploadMealPhoto(
  d1: D1Database,
  bucket: R2Bucket,
  spaceId: SpaceId,
  mealId: MealId,
  userId: UserId,
  input: UploadPhotoInput,
  now: string,
): Promise<MealPhotoSummary> {
  const id = crypto.randomUUID();
  const keys = photoKeys(spaceId, mealId, id);
  const thumbKey = input.thumb ? keys.thumb : null;

  await bucket.put(keys.full, input.full.bytes, {
    httpMetadata: { contentType: input.full.contentType },
  });
  if (input.thumb && thumbKey) {
    await bucket.put(thumbKey, input.thumb.bytes, {
      httpMetadata: { contentType: input.thumb.contentType },
    });
  }

  try {
    await drizzle(d1).insert(mealPhotos).values({
      id,
      mealId,
      r2Key: keys.full,
      thumbKey,
      contentType: input.full.contentType,
      sizeBytes: input.full.bytes.byteLength,
      width: input.width,
      height: input.height,
      createdBy: userId,
      createdAt: now,
    });
  } catch (e) {
    await bucket.delete(thumbKey ? [keys.full, thumbKey] : keys.full);
    throw e;
  }

  return { id, width: input.width, height: input.height, hasThumb: thumbKey !== null, createdAt: now };
}

// 一覧用。meal は呼び出し側が space で絞った id 群なので join は不要
export async function photosByMealIds(
  db: Db,
  mealIds: string[],
): Promise<Map<string, MealPhotoSummary[]>> {
  const map = new Map<string, MealPhotoSummary[]>();
  if (mealIds.length === 0) return map;
  const rows = await db
    .select({
      mealId: mealPhotos.mealId,
      id: mealPhotos.id,
      width: mealPhotos.width,
      height: mealPhotos.height,
      thumbKey: mealPhotos.thumbKey,
      createdAt: mealPhotos.createdAt,
    })
    .from(mealPhotos)
    .where(inArray(mealPhotos.mealId, mealIds))
    .orderBy(asc(mealPhotos.createdAt), asc(mealPhotos.id));
  for (const { mealId, thumbKey, ...rest } of rows) {
    const list = map.get(mealId) ?? [];
    list.push({ ...rest, hasThumb: thumbKey !== null });
    map.set(mealId, list);
  }
  return map;
}

export type PhotoRow = {
  id: string;
  r2Key: string;
  thumbKey: string | null;
  contentType: string;
};

// photo 行は meals と join して space_id まで一致した時だけ返す（横流れは行ごと見えない）
export async function getPhoto(
  db: Db,
  spaceId: SpaceId,
  mealId: MealId,
  photoId: MealPhotoId,
): Promise<PhotoRow | null> {
  const rows = await db
    .select({
      id: mealPhotos.id,
      r2Key: mealPhotos.r2Key,
      thumbKey: mealPhotos.thumbKey,
      contentType: mealPhotos.contentType,
    })
    .from(mealPhotos)
    .innerJoin(meals, eq(mealPhotos.mealId, meals.id))
    .where(
      and(eq(mealPhotos.id, photoId), eq(meals.id, mealId), eq(meals.spaceId, spaceId)),
    );
  return rows[0] ?? null;
}

// R2 を先に消す（skill）。R2 が落ちたら行が残り、ユーザーは再試行できる。
// 逆順だと一時的な R2 障害がアプリから消せない orphan object になる
export async function deleteMealPhoto(
  d1: D1Database,
  bucket: R2Bucket,
  spaceId: SpaceId,
  mealId: MealId,
  photoId: MealPhotoId,
): Promise<boolean> {
  const db = drizzle(d1);
  const row = await getPhoto(db, spaceId, mealId, photoId);
  if (!row) return false;
  await bucket.delete(row.thumbKey ? [row.r2Key, row.thumbKey] : row.r2Key);
  await db.delete(mealPhotos).where(eq(mealPhotos.id, row.id));
  return true;
}

// 親 meal 削除用: 消すべき key を全部集める（行は CASCADE で消えるので R2 だけがこちらの責務）
export async function photoKeysOfMeal(
  db: Db,
  spaceId: SpaceId,
  mealId: MealId,
): Promise<string[]> {
  const rows = await db
    .select({ r2Key: mealPhotos.r2Key, thumbKey: mealPhotos.thumbKey })
    .from(mealPhotos)
    .innerJoin(meals, eq(mealPhotos.mealId, meals.id))
    .where(and(eq(meals.id, mealId), eq(meals.spaceId, spaceId)));
  return rows.flatMap((r) => (r.thumbKey ? [r.r2Key, r.thumbKey] : [r.r2Key]));
}

import { drizzle } from "drizzle-orm/d1";
import { Hono, type Context } from "hono";
import { err, ok, type Result } from "neverthrow";
import { errorBody, errorStatus, parseWith, type AppError } from "../domain/errors";
import { MealId } from "../domain/meal";
import {
  MAX_PHOTO_BYTES,
  MealPhotoId,
  PhotoDimensions,
  isAllowedImageType,
  sniffImageType,
} from "../domain/photo";
import type { SpaceEnv } from "../env";
import { serveR2Object } from "../lib/r2-object";
import {
  deleteMealPhoto,
  getPhoto,
  mealExists,
  uploadMealPhoto,
  type ImageBytes,
} from "../meals/photos";

function fail(c: Context<SpaceEnv>, error: AppError) {
  return c.json(errorBody(error), errorStatus(error));
}

// multipart の 1 パートを画像として読む。無いときは ok(null)（必須かは呼び出し側が決める）。
// content-type 申告は見ず、先頭バイトの sniff だけを信じる
async function readImagePart(
  form: FormData,
  field: string,
): Promise<Result<ImageBytes | null, AppError>> {
  const part = form.get(field);
  if (part === null) return ok(null);
  // FormDataEntryValue = string | File。`instanceof File` は worker tsconfig で TS2358 に
  // なるので、string を除外して File に絞る
  if (typeof part === "string") {
    return err({ type: "validation_error", message: `${field}: ファイルではありません` });
  }
  if (part.size === 0) {
    return err({ type: "validation_error", message: `${field}: 空のファイルです` });
  }
  if (part.size > MAX_PHOTO_BYTES) {
    return err({ type: "photo_too_large", maxBytes: MAX_PHOTO_BYTES });
  }
  const bytes = new Uint8Array(await part.arrayBuffer());
  const sniffed = sniffImageType(bytes.subarray(0, 12));
  if (!isAllowedImageType(sniffed)) {
    return err({ type: "photo_type_not_allowed", message: sniffed ?? (part.type || "unknown") });
  }
  return ok({ bytes, contentType: sniffed });
}

// /api/spaces/:spaceId/meals/:mealId/photos — spaceMiddleware が所属を証明済み。
// meal・photo を引く文は必ず space_id まで比較する（横流れはすべて 404）
export const mealPhotoRoutes = new Hono<SpaceEnv>()
  .post("/", async (c) => {
    const mealId = parseWith(MealId, c.req.param("mealId"));
    if (mealId.isErr()) return fail(c, { type: "not_found" });
    if (!(await mealExists(drizzle(c.env.DB), c.var.spaceId, mealId.value))) {
      return fail(c, { type: "not_found" });
    }
    // multipart 以外で formData() を呼ぶと throw して素の 500 になるので header で先に弾く
    const contentType = c.req.header("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
      return fail(c, { type: "validation_error", message: "multipart/form-data で送ってください" });
    }
    const form = await c.req.formData();

    const full = await readImagePart(form, "file");
    if (full.isErr()) return fail(c, full.error);
    if (full.value === null) {
      return fail(c, { type: "validation_error", message: "file: 写真がありません" });
    }
    const thumb = await readImagePart(form, "thumb");
    if (thumb.isErr()) return fail(c, thumb.error);
    const dims = parseWith(PhotoDimensions, {
      width: form.get("width"),
      height: form.get("height"),
    });
    if (dims.isErr()) return fail(c, dims.error);

    const now = new Date().toISOString();
    const created = await uploadMealPhoto(
      c.env.DB,
      c.env.PHOTOS_BUCKET,
      c.var.spaceId,
      mealId.value,
      c.var.userId,
      { full: full.value, thumb: thumb.value, width: dims.value.width, height: dims.value.height },
      now,
    );
    return c.json({ ...created, mealId: mealId.value }, 201);
  })

  // ?variant=thumb でサムネ。R2 に触るのは認可（join で meal + space 一致）を通った後だけ
  .get("/:photoId", async (c) => {
    const mealId = parseWith(MealId, c.req.param("mealId"));
    const photoId = parseWith(MealPhotoId, c.req.param("photoId"));
    if (mealId.isErr() || photoId.isErr()) return fail(c, { type: "not_found" });
    const row = await getPhoto(drizzle(c.env.DB), c.var.spaceId, mealId.value, photoId.value);
    if (!row) return fail(c, { type: "not_found" });

    const key = c.req.query("variant") === "thumb" && row.thumbKey ? row.thumbKey : row.r2Key;
    // thumb は本体と別 object。行の content_type は object 側が欠けたときの控え
    const res = await serveR2Object(c.env.PHOTOS_BUCKET, key, c.req.raw.headers, row.contentType);
    if (res === null) {
      console.error("[meal-photos] row without R2 object", key);
      return fail(c, { type: "not_found" });
    }
    return res;
  })

  .delete("/:photoId", async (c) => {
    const mealId = parseWith(MealId, c.req.param("mealId"));
    const photoId = parseWith(MealPhotoId, c.req.param("photoId"));
    if (mealId.isErr() || photoId.isErr()) return fail(c, { type: "not_found" });
    const deleted = await deleteMealPhoto(
      c.env.DB,
      c.env.PHOTOS_BUCKET,
      c.var.spaceId,
      mealId.value,
      photoId.value,
    );
    if (!deleted) return fail(c, { type: "not_found" });
    return c.json({});
  });

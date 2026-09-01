import { z } from "zod";

export type MealPhotoId = string & { readonly __brand: unique symbol };
export const MealPhotoId = z.uuid().transform((v) => v as MealPhotoId);

// 受け付ける画像。file.type はクライアント申告なので信用せず、先頭バイトの sniff 結果で決める。
// HEIC は Android / Chrome の <img> が表示できないので識別だけして 415 で断る
// （クライアントは canvas で JPEG に変換して送る。ここに HEIC が届くのは変換できなかった端末）。
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

// クライアントは 1600px JPEG（〜400 KB）に縮小して送るので、これは異常入力を止める上限。
// プラットフォーム上限（100 MB）よりずっと手前で切る
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

// ISO BMFF の HEIF container brand（iPhone の HEIC 写真など）
const HEIF_BRANDS = new Set([
  "heic",
  "heix",
  "hevc",
  "hevx",
  "heim",
  "heis",
  "hevm",
  "hevs",
  "mif1",
  "msf1",
]);

function ascii(bytes: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...bytes.subarray(from, to));
}

// 先頭 12 バイトから container を判定する総関数。判定できないもの（PDF / EXE / HTML …）は null
export function sniffImageType(head: Uint8Array): AllowedImageType | "image/heic" | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    head.length >= 8 &&
    head[0] === 0x89 &&
    head[1] === 0x50 &&
    head[2] === 0x4e &&
    head[3] === 0x47 &&
    head[4] === 0x0d &&
    head[5] === 0x0a &&
    head[6] === 0x1a &&
    head[7] === 0x0a
  ) {
    return "image/png";
  }
  if (head.length >= 12 && ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (head.length >= 12 && ascii(head, 4, 8) === "ftyp" && HEIF_BRANDS.has(ascii(head, 8, 12))) {
    return "image/heic";
  }
  return null;
}

export function isAllowedImageType(
  t: AllowedImageType | "image/heic" | null,
): t is AllowedImageType {
  return t !== null && (ALLOWED_IMAGE_TYPES as readonly string[]).includes(t);
}

// R2 キーは拡張子なし（content_type は行と httpMetadata が持つ）。spaceId 接頭辞で
// 1 家族分を list / wipe できる。thumb は本体キーの下（<key>/w320）
export function photoKeys(
  spaceId: string,
  mealId: string,
  photoId: string,
): { full: string; thumb: string } {
  const full = `photos/${spaceId}/${mealId}/${photoId}`;
  return { full, thumb: `${full}/w320` };
}

// multipart の width / height フィールド（文字列）。クライアントの canvas 縮小結果なので
// 必ず正の整数で来る。上限はクライアント上限（1600px）より緩く、異常値だけ止める
export const PhotoDimensions = z.object({
  width: z.coerce.number().int().min(1).max(10000),
  height: z.coerce.number().int().min(1).max(10000),
});
export type PhotoDimensions = z.output<typeof PhotoDimensions>;

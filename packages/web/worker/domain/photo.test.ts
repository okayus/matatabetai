import { describe, expect, it } from "vitest";
import {
  MealPhotoId,
  PhotoDimensions,
  isAllowedImageType,
  photoKeys,
  sniffImageType,
} from "./photo";

// 先頭バイトのフィクスチャ。実ファイルの先頭 12 バイトと同じ並び
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const ascii = (s: string) => Array.from(s, (ch) => ch.charCodeAt(0));
const WEBP = Uint8Array.from([...ascii("RIFF"), 0x24, 0x00, 0x00, 0x00, ...ascii("WEBP")]);
const HEIC = Uint8Array.from([0x00, 0x00, 0x00, 0x18, ...ascii("ftyp"), ...ascii("heic")]);
const HEIF_MIF1 = Uint8Array.from([0x00, 0x00, 0x00, 0x18, ...ascii("ftyp"), ...ascii("mif1")]);

describe("sniffImageType", () => {
  it("JPEG / PNG / WebP を先頭バイトで判定する", () => {
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(WEBP)).toBe("image/webp");
  });
  it("HEIC / HEIF は識別して返す（route が 415 にする）", () => {
    expect(sniffImageType(HEIC)).toBe("image/heic");
    expect(sniffImageType(HEIF_MIF1)).toBe("image/heic");
  });
  it("画像でないもの・拡張子偽装は null（file.type は見ない）", () => {
    expect(sniffImageType(Uint8Array.from(ascii("%PDF-1.7 xxxx")))).toBeNull();
    expect(sniffImageType(Uint8Array.from(ascii("<!doctype html")))).toBeNull();
    expect(sniffImageType(Uint8Array.from(ascii("MZ\x90\x00")))).toBeNull();
    expect(sniffImageType(Uint8Array.from([]))).toBeNull();
  });
  it("RIFF でも WEBP でなければ null（WAV 等）", () => {
    expect(sniffImageType(Uint8Array.from([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVE")]))).toBeNull();
  });
  it("JPEG は 3 バイトあれば判定できる（12 バイト未満の入力も総関数）", () => {
    expect(sniffImageType(JPEG.subarray(0, 3))).toBe("image/jpeg");
    expect(sniffImageType(JPEG.subarray(0, 2))).toBeNull();
  });
});

describe("isAllowedImageType", () => {
  it("許可 3 形式だけ true。HEIC と null は false", () => {
    expect(isAllowedImageType("image/jpeg")).toBe(true);
    expect(isAllowedImageType("image/png")).toBe(true);
    expect(isAllowedImageType("image/webp")).toBe(true);
    expect(isAllowedImageType("image/heic")).toBe(false);
    expect(isAllowedImageType(null)).toBe(false);
  });
});

describe("photoKeys", () => {
  it("photos/<spaceId>/<mealId>/<photoId> と <…>/w320（拡張子なし）", () => {
    const k = photoKeys("s1", "m1", "p1");
    expect(k.full).toBe("photos/s1/m1/p1");
    expect(k.thumb).toBe("photos/s1/m1/p1/w320");
  });
});

describe("PhotoDimensions", () => {
  it("form の文字列を正の整数に coerce する", () => {
    expect(PhotoDimensions.parse({ width: "1600", height: "900" })).toEqual({
      width: 1600,
      height: 900,
    });
  });
  it.each([
    { width: "0", height: "10" },
    { width: "-1", height: "10" },
    { width: "1.5", height: "10" },
    { width: "abc", height: "10" },
    { width: "99999", height: "10" },
    { height: "10" },
  ])("寸法にならない入力は落とす %j", (input) => {
    expect(PhotoDimensions.safeParse(input).success).toBe(false);
  });
});

describe("MealPhotoId", () => {
  it("UUID だけを通す", () => {
    expect(MealPhotoId.safeParse(crypto.randomUUID()).success).toBe(true);
    expect(MealPhotoId.safeParse("../../etc/passwd").success).toBe(false);
    expect(MealPhotoId.safeParse("").success).toBe(false);
  });
});

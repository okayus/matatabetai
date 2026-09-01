// アップロード前にブラウザで縮小して JPEG に再エンコードする。
// canvas 再エンコードは EXIF（自宅の GPS・機種情報）を運ばず、3–8 MB の写真が数百 KB になる。
// Worker 側に画像デコーダは無いので、変換はここでしかできない。

export type PreparedImage = { blob: Blob; width: number; height: number };
export type PreparedPhoto = { full: PreparedImage; thumb: PreparedImage };

const FULL_MAX_PX = 1600; // スマホ画面と 2x カードに十分
const THUMB_MAX_PX = 320; // 一覧のタイル
const JPEG_QUALITY = 0.85;

function fit(w: number, h: number, max: number): [number, number] {
  const scale = Math.min(1, max / Math.max(w, h)); // 拡大はしない
  return [Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale))];
}

async function encode(bitmap: ImageBitmap, maxPx: number): Promise<PreparedImage> {
  const [w, h] = fit(bitmap.width, bitmap.height, maxPx);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) throw new Error("canvas.toBlob returned null");
  return { blob, width: w, height: h };
}

// デコードできないファイル（Chrome / Android の HEIC、壊れたデータ）は null。
// その場合なにもアップロードせず、呼び出し側が案内を出す
export async function preparePhoto(file: File): Promise<PreparedPhoto | null> {
  let bitmap: ImageBitmap;
  try {
    // from-image が EXIF の orientation を適用する（縦写真が横倒しにならない）
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
  try {
    const full = await encode(bitmap, FULL_MAX_PX);
    const thumb = await encode(bitmap, THUMB_MAX_PX);
    return { full, thumb };
  } finally {
    bitmap.close();
  }
}

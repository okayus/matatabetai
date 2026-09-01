// 8×8 の赤一色 PNG（74 バイト）。headless Chromium がデコードでき、クライアントの
// preparePhoto が実際に canvas → JPEG 再エンコードを通る（サーバーの sniff は FF D8 FF を見る）
export const PNG_8x8 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR42mM4YWODFTEMLQkAZZlQAS/gME0AAAAASUVORK5CYII=",
  "base64",
);

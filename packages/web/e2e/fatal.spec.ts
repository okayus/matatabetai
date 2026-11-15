import { expect, test } from "@playwright/test";

const SPACE_ID = "fatal-space";

// 再読み込みの画面の配線: main.tsx が createRoot に渡した onUncaughtError が FatalScreen を描く。
// クライアントは API の応答を型へキャストするだけで検証しない（src/api.ts）ので、deploy を
// またいで開いたままのタブが形の変わった応答を受けると、描画中に例外が出る。
// それを /api の差し替えで起こす: セッションありの me と、photos を欠いた記録（写真の壁が
// photos.length を読んで落ちる）。アカウントも D1 の行も要らない。
test("a render error leaves the reload screen, not a blank page", async ({ page }) => {
  await page.route("**/api/**", (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === "/api/auth/me") {
      return route.fulfill({
        json: {
          id: "fatal-user",
          displayName: "e2e",
          spaces: [
            { id: SPACE_ID, name: "e2e", role: "owner", memberCount: 1, createdAt: "2026-01-01T00:00:00.000Z" },
          ],
        },
      });
    }
    if (pathname === `/api/spaces/${SPACE_ID}/meals`) {
      return route.fulfill({ json: [{ id: "malformed" }] });
    }
    return route.fulfill({ status: 500, json: { error: { type: "internal" } } });
  });

  await page.goto("/");
  const screen = page.getByRole("alert");
  await expect(screen.getByRole("heading", { name: "表示できませんでした" })).toBeVisible();
  // アプリは知らせの後ろに隠れているのではなく、外れている
  await expect(page.getByRole("banner")).toHaveCount(0);

  // 「再読み込み」は本物の reload。差し替えを外せばアプリが戻る（この context に
  // セッションは無いので、戻る先はログイン画面）
  await page.unroute("**/api/**");
  await page.getByRole("button", { name: "再読み込み" }).click();
  await expect(page.getByRole("heading", { name: "またたべたい" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "表示できませんでした" })).toHaveCount(0);
});

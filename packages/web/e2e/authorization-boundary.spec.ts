import { expect, test } from "@playwright/test";
import { E2E_INITIAL_REGISTRATION_TOKEN } from "../playwright.config";
import { OTHER_MEAL_ID, OTHER_SPACE_ID } from "./global-setup";
import { enableVirtualAuthenticator } from "./helpers/webauthn";

// 認可の横流れ: 他スペースは API で 404（本文まで固定）、UI はアクセス拒否の一文。403 は存在を漏らす。
test("a member of space A gets 404 for space B (API and UI)", async ({ page, baseURL }) => {
  await enableVirtualAuthenticator(page);
  await page.goto("/register");
  await page.getByLabel("表示名").fill("e2e-stranger");
  await page.getByLabel("登録トークン").fill(E2E_INITIAL_REGISTRATION_TOKEN);
  await page.getByRole("button", { name: "パスキーを作って登録" }).click();
  await expect(page.getByRole("heading", { name: /こんにちは、e2e-stranger さん/ })).toBeVisible();

  const origin = { Origin: baseURL ?? "" };
  const read = await page.request.get(`/api/spaces/${OTHER_SPACE_ID}`);
  expect(read.status()).toBe(404);
  expect(await read.json()).toEqual({ error: { type: "not_found" } });

  const members = await page.request.get(`/api/spaces/${OTHER_SPACE_ID}/members`);
  expect(members.status()).toBe(404);
  expect(await members.json()).toEqual({ error: { type: "not_found" } });

  const otherMeals = await page.request.get(`/api/spaces/${OTHER_SPACE_ID}/meals`);
  expect(otherMeals.status()).toBe(404);
  expect(await otherMeals.json()).toEqual({ error: { type: "not_found" } });

  // 書き込みも 404（403 でも 500 でもない）。非 GET なので Origin を付ける
  const write = await page.request.post(`/api/spaces/${OTHER_SPACE_ID}/invites`, { headers: origin });
  expect(write.status()).toBe(404);
  expect(await write.json()).toEqual({ error: { type: "not_found" } });

  // 自分のスペースは見える（404 が配線の壊れではなく所属判定であることの対照）
  const me = await page.request.get("/api/auth/me");
  const mine = ((await me.json()) as { spaces: { id: string }[] }).spaces[0]?.id ?? "";
  expect((await page.request.get(`/api/spaces/${mine}`)).status()).toBe(200);

  // 自分のスペースの URL に他スペースの meal id を当てても 404（meal は space_id ごと引く）
  const crossPatch = await page.request.patch(`/api/spaces/${mine}/meals/${OTHER_MEAL_ID}`, {
    headers: origin,
    data: { mataTabetai: true },
  });
  expect(crossPatch.status()).toBe(404);
  expect(await crossPatch.json()).toEqual({ error: { type: "not_found" } });

  // 写真ルートも同じ（photo の認可連鎖は meal の space 一致で切れる。R2 には触れない）
  const crossPhoto = await page.request.get(
    `/api/spaces/${mine}/meals/${OTHER_MEAL_ID}/photos/00000000-0000-4000-8000-000000000001`,
  );
  expect(crossPhoto.status()).toBe(404);
  expect(await crossPhoto.json()).toEqual({ error: { type: "not_found" } });

  const crossUpload = await page.request.post(
    `/api/spaces/${OTHER_SPACE_ID}/meals/${OTHER_MEAL_ID}/photos`,
    { headers: origin },
  );
  expect(crossUpload.status()).toBe(404);
  expect(await crossUpload.json()).toEqual({ error: { type: "not_found" } });

  await page.goto(`/spaces/${OTHER_SPACE_ID}/settings`);
  await expect(page.getByText("アクセス権がありません")).toBeVisible();
});

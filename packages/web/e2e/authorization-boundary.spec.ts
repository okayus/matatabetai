import { expect, test } from "@playwright/test";
import { E2E_INITIAL_REGISTRATION_TOKEN } from "../playwright.config";
import { OTHER_MEAL_ID, OTHER_SPACE_ID, OTHER_TAG_NAME } from "./global-setup";
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

  const otherSuggestions = await page.request.get(
    `/api/spaces/${OTHER_SPACE_ID}/meals/suggestions`,
  );
  expect(otherSuggestions.status()).toBe(404);
  expect(await otherSuggestions.json()).toEqual({ error: { type: "not_found" } });

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

  // サジェストとタグは集約するぶん space_id を落としやすい。自分のスペースは空のまま
  // （他家族の「よその肉じゃが」もそのタグも混ざらない）
  expect(await (await page.request.get(`/api/spaces/${mine}/meals/suggestions`)).json()).toEqual([]);
  expect(await (await page.request.get(`/api/spaces/${mine}/tags`)).json()).toEqual([]);

  // 集計とフィルタ付き一覧も同じ集約クラス。他スペースの stats は 404、自分のスペースでは
  // seed の「よその肉じゃが」（♥ 付き・タグ付き）がどのフィルタにも数えられない
  const otherStats = await page.request.get(`/api/spaces/${OTHER_SPACE_ID}/meals/stats`);
  expect(otherStats.status()).toBe(404);
  expect(await otherStats.json()).toEqual({ error: { type: "not_found" } });
  expect(await (await page.request.get(`/api/spaces/${mine}/meals/stats`)).json()).toEqual([]);
  expect(await (await page.request.get(`/api/spaces/${mine}/meals?mataTabetai=1`)).json()).toEqual([]);
  expect(
    await (
      await page.request.get(`/api/spaces/${mine}/meals?tags=${encodeURIComponent(OTHER_TAG_NAME)}`)
    ).json(),
  ).toEqual([]);

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

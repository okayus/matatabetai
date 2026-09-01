import { expect, test } from "@playwright/test";
import { E2E_INITIAL_REGISTRATION_TOKEN } from "../playwright.config";
import { enableVirtualAuthenticator } from "./helpers/webauthn";

// 配線の事実: 初回登録（パスキー作成 → users/spaces/space_members/credentials/sessions）→
// リロードでセッションが残る → 投稿作成（meals/tags/meal_tags）→ またたべたいトグル →
// リロードで投稿とトグルが残る → 削除 → 招待リンク発行 → 別ブラウザが招待から登録 →
// メンバーに並ぶ → ログアウト → パスキーでログインし直す。ドメインの意味はユニットに譲る。
test("register → reload → meal record → invite → second member → logout → login", async ({ page, browser, baseURL }) => {
  await enableVirtualAuthenticator(page);

  await page.goto("/register");
  await page.getByLabel("表示名").fill("e2e-owner");
  await page.getByLabel("登録トークン").fill(E2E_INITIAL_REGISTRATION_TOKEN);
  await page.getByLabel("この端末の名前（任意）").fill("virtual");
  await page.getByRole("button", { name: "パスキーを作って登録" }).click();

  await expect(page.getByRole("heading", { name: /こんにちは、e2e-owner さん/ })).toBeVisible();
  await expect(page.getByText("e2e-ownerの食卓")).toBeVisible();

  // 永続化の事実: リロード後もログイン状態と表示名が残る
  await page.reload();
  await expect(page.getByRole("heading", { name: /こんにちは、e2e-owner さん/ })).toBeVisible();

  // 投稿作成（meals / tags / meal_tags が繋がっている）
  await page.getByLabel("料理名").fill("肉じゃが");
  await page.getByLabel("タグ").fill("じゃがいも 牛肉");
  await page.getByRole("button", { name: "記録する" }).click();
  await expect(page.getByText("肉じゃが", { exact: true })).toBeVisible();
  await expect(page.getByText("じゃがいも", { exact: true })).toBeVisible();
  await expect(page.getByText("牛肉", { exact: true })).toBeVisible();

  // またたべたいトグル → リロードで投稿もトグルも残る（永続化はユニットでは検知不能）
  const mataButton = page.getByRole("button", { name: /またたべたい/ });
  await expect(mataButton).toHaveAttribute("aria-pressed", "false");
  await mataButton.click();
  await expect(mataButton).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByText("肉じゃが", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /またたべたい/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // 削除（confirm を受ける）
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: /削除/ }).click();
  await expect(page.getByText("肉じゃが", { exact: true })).toHaveCount(0);
  await expect(page.getByText("まだ記録がありません", { exact: false })).toBeVisible();

  // 招待リンクを発行
  await page.getByRole("link", { name: "設定" }).click();
  await expect(page.getByRole("heading", { name: "e2e-ownerの食卓" })).toBeVisible();
  await page.getByRole("button", { name: "招待リンクを作る" }).click();
  const inviteUrl = await page.getByLabel(/招待リンク/).inputValue();
  expect(inviteUrl.startsWith(`${baseURL}/invite#token=`)).toBe(true);

  // 別の家族（別ブラウザコンテキスト = 別 authenticator）が招待から登録
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await enableVirtualAuthenticator(page2);
  await page2.goto(inviteUrl);
  await expect(page2.getByRole("heading", { name: "招待されました" })).toBeVisible();
  // トークンはアドレスバーから消えている
  expect(new URL(page2.url()).hash).toBe("");
  await page2.getByLabel("表示名").fill("e2e-member");
  await page2.getByRole("button", { name: "パスキーを作って参加" }).click();
  await expect(page2.getByRole("heading", { name: /こんにちは、e2e-member さん/ })).toBeVisible();
  await expect(page2.getByText("e2e-ownerの食卓")).toBeVisible();
  await expect(page2.getByText("メンバー", { exact: true })).toBeVisible();
  await ctx2.close();

  // オーナー側のメンバー一覧に並ぶ。同じリンクはもう使えない（未使用の招待から消える）
  await page.reload();
  await expect(page.getByText("e2e-member")).toBeVisible();
  await expect(page.getByText("未使用の招待")).toHaveCount(0);

  // ログアウト → ログイン（discoverable credential）
  await page.getByRole("link", { name: "アカウント" }).click();
  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page.getByRole("button", { name: "パスキーでログイン" })).toBeVisible();
  const me = await page.request.get("/api/auth/me");
  expect(me.status()).toBe(401);

  await page.getByRole("button", { name: "パスキーでログイン" }).click();
  await expect(page.getByRole("heading", { name: /こんにちは、e2e-owner さん/ })).toBeVisible();
});

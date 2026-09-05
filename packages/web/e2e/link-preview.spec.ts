import { expect, test } from "@playwright/test";
import { E2E_INITIAL_REGISTRATION_TOKEN, E2E_PORT } from "../playwright.config";
import { enableVirtualAuthenticator } from "./helpers/webauthn";

// URL プレビュー（ADR-007）の配線: 投稿 → 応答後の waitUntil が OGP を取って
// meal_link_previews と private R2 に置く → 次に一覧を読むとカードになる。
// 外部サイトには依存させない（サンドボックスは egress 制限で出られない — ADR-007 §7）。
// 「外部サイト」は wrangler dev 自身が配る固定 HTML で、Worker はそれを普通の URL として取りに行く。
// ブラウザは localhost で開くが、Worker → 自分自身は 127.0.0.1（コンテナの dual-stack 対策）。
const FIXTURE_URL = `http://127.0.0.1:${E2E_PORT}/e2e-fixture/`;
// OGP を出さないページ（見出しは <title>、画像なし）
const TITLE_ONLY_URL = `http://127.0.0.1:${E2E_PORT}/e2e-fixture/title-only.html`;
// 貼り替え先（og:image を持たない別ページ）
const SWAPPED_URL = `http://127.0.0.1:${E2E_PORT}/e2e-fixture/swapped.html`;
// 何も listen していないポート = 取りに行けない URL（リンク切れ・bot ブロック相当）
const UNREACHABLE_URL = "http://127.0.0.1:5199/blocked";

test("OGP が取れた URL はカードになり、取れない URL はプレーンリンクのまま", async ({ page }) => {
  await enableVirtualAuthenticator(page);
  await page.goto("/register");
  await page.getByLabel("表示名").fill("e2e-ogp");
  await page.getByLabel("登録トークン").fill(E2E_INITIAL_REGISTRATION_TOKEN);
  await page.getByRole("button", { name: "パスキーを作って登録" }).click();
  // ホームの h1 と region 名はスペース名（ADR-009 §5）
  await expect(page.getByRole("heading", { name: "e2e-ogpの食卓" })).toBeVisible();

  // 記録フォームは dialog（requirements 14）、タイムラインの既定は写真だけ（requirements 15）。
  // リンクのカードは くわしく にあるので、読み込み直すたびに押し直す
  const feed = page.getByRole("region", { name: "e2e-ogpの食卓" });
  const composer = page.getByRole("dialog", { name: "たべたものを記録" });
  const openComposer = () => page.getByRole("button", { name: "たべたものを記録する" }).click();
  const showDetails = () => feed.getByRole("button", { name: "くわしく" }).click();
  await openComposer();
  await composer.getByLabel("料理名").fill("プレビューの肉じゃが");
  await composer.getByLabel("レシピ URL").fill(FIXTURE_URL);
  await composer.getByLabel("お店・商品 URL").fill(UNREACHABLE_URL);
  await composer.getByRole("button", { name: "記録する" }).click();
  await expect(composer).toBeHidden();
  await showDetails();
  await expect(feed.getByText("プレビューの肉じゃが", { exact: true })).toBeVisible();

  // 投稿の応答時点ではどちらも取得中。カードはまだ無く、リンクとしては最初から働く
  await expect(feed.getByRole("link", { name: /^レシピ:/ })).toHaveAttribute("href", FIXTURE_URL);

  // 取得は応答後（waitUntil）なので、一覧を読み直すまで反映されない。
  // og:title が出る = <title>（「タイトル要素のほう」）ではなく OGP を読んでいる証拠でもあり、
  // fixture が配られず SPA の index.html が返っていないことの証拠でもある
  const card = feed.getByRole("link", { name: /e2e レシピ: ほくほく肉じゃが/ });
  await expect(async () => {
    await page.reload();
    await showDetails();
    await expect(card).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await expect(card).toHaveAttribute("href", FIXTURE_URL);
  await expect(card).toContainText("e2e レシピ帳");

  // og:image は hotlink せず取り込んである: 相対 URL が解決され、private R2 から
  // 認可つき proxy で配られ、ブラウザが実際にデコードできている
  const image = card.locator("img");
  await expect(image).toHaveAttribute("src", /\/link-previews\/recipe\/image$/);
  await expect
    .poll(async () => image.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);
  const imagePath = new URL(await image.evaluate((el: HTMLImageElement) => el.src)).pathname;
  const served = await page.request.get(imagePath);
  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toBe("image/png");
  // 写真と違い、この URL は kind ごとに固定で貼り替えると中身が変わる（ADR-008 §5）。
  // ブラウザに寝かせず毎回 ETag で確かめさせる
  expect(served.headers()["cache-control"]).toBe("private, no-cache");

  // 取れなかったほうは行が failed のまま = プレーンリンク（ADR-007 §5）。
  // 画像も無いので proxy は 404
  await expect(feed.getByRole("link", { name: /^お店・商品:/ })).toHaveAttribute(
    "href",
    UNREACHABLE_URL,
  );
  expect((await page.request.get(imagePath.replace("/recipe/", "/shop/"))).status()).toBe(404);

  // 編集で URL を貼り替えると、そのぶんだけ取り直す（ADR-008 §5）。旧行は捨てられ、
  // 一緒に旧 og:image も R2 から消えるので、同じ配信 URL が 404 になる
  await feed.getByRole("button", { name: /編集/ }).click();
  const editForm = page.getByRole("form", { name: "記録を編集" });
  await expect(editForm.getByLabel("レシピ URL")).toHaveValue(FIXTURE_URL);
  await editForm.getByLabel("レシピ URL").fill(SWAPPED_URL);
  await editForm.getByRole("button", { name: "保存する" }).click();
  await expect(editForm).toHaveCount(0);

  const swappedCard = feed.getByRole("link", { name: /e2e レシピ: 貼り替え後のカレー/ });
  await expect(async () => {
    await page.reload();
    await showDetails();
    await expect(swappedCard).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await expect(swappedCard).toHaveAttribute("href", SWAPPED_URL);
  await expect(card).toHaveCount(0);
  await expect(swappedCard.locator("img")).toHaveCount(0);
  expect((await page.request.get(imagePath)).status()).toBe(404);
  // 触っていない お店・商品 の欄はそのまま（同じ URL の行は取り直さない）
  await expect(feed.getByRole("link", { name: /^お店・商品:/ })).toHaveAttribute(
    "href",
    UNREACHABLE_URL,
  );

  // OGP を出さないページは <title> を見出しにした画像なしのカードになる。
  // og:* → <title> の fallback は HTMLRewriter のセレクタが実際に当たっているかの検査でもある
  await openComposer();
  await composer.getByLabel("料理名").fill("タイトルだけの記録");
  await composer.getByLabel("レシピ URL").fill(TITLE_ONLY_URL);
  await composer.getByRole("button", { name: "記録する" }).click();
  await expect(composer).toBeHidden();
  const titleOnlyCard = feed.getByRole("link", { name: /タイトルだけのページ \| e2e 商店/ });
  await expect(async () => {
    await page.reload();
    await showDetails();
    await expect(titleOnlyCard).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await expect(titleOnlyCard.locator("img")).toHaveCount(0);

  // 投稿を消すと R2 の og:image も消える（写真と同じ R2 → D1 の順 — ADR-004 §6）
  page.once("dialog", (dialog) => void dialog.accept());
  await feed.getByRole("button", { name: /削除.*プレビューの肉じゃが/ }).click();
  await expect(feed.getByText("プレビューの肉じゃが", { exact: true })).toHaveCount(0);
  await expect.poll(async () => (await page.request.get(imagePath)).status()).toBe(404);
});

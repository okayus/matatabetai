import { expect, test } from "@playwright/test";
import { E2E_INITIAL_REGISTRATION_TOKEN } from "../playwright.config";
import { PNG_8x8 } from "./fixtures/png";
import { enableVirtualAuthenticator } from "./helpers/webauthn";

// 配線の事実: 初回登録（パスキー作成 → users/spaces/space_members/credentials/sessions）→
// リロードでセッションが残る → 投稿作成（meals/tags/meal_tags + 写真 2 枚: 縮小 → R2 →
// proxy 配信・304）→ 写真 1 枚削除 → またたべたいトグル → リロードで投稿・トグル・写真が残る →
// サジェスト（料理名ごとの直近 1 件・タグ AND 絞り込み・前回内容の引き継ぎ）→
// 削除（R2 も消える）→ 招待リンク発行 → 別ブラウザが招待から登録 →
// メンバーに並ぶ → ログアウト → パスキーでログインし直す。ドメインの意味はユニットに譲る。
test("register → reload → meal record with photos → suggestion → invite → second member → logout → login", async ({ page, browser, baseURL }) => {
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

  // 記録フォームとみんなの記録は同じ料理名を出す（サジェストの札 / 一覧）ので、名前で分ける
  const form = page.getByRole("form", { name: "たべたものを記録" });
  const feed = page.getByRole("region", { name: "みんなの記録" });

  // 投稿作成（meals / tags / meal_tags が繋がっている）+ 写真 2 枚。
  // setInputFiles の PNG をクライアントが canvas で JPEG に縮小してから multipart で送る
  await page.getByLabel("料理名").fill("肉じゃが");
  await page.getByLabel("タグ").fill("じゃがいも 牛肉");
  await page.getByLabel("写真", { exact: true }).setInputFiles([
    { name: "one.png", mimeType: "image/png", buffer: PNG_8x8 },
    { name: "two.png", mimeType: "image/png", buffer: PNG_8x8 },
  ]);
  await expect(page.getByAltText("選択中の写真 2")).toBeVisible();
  await page.getByRole("button", { name: "記録する" }).click();
  await expect(feed.getByText("肉じゃが", { exact: true })).toBeVisible();
  await expect(feed.getByText("じゃがいも", { exact: true })).toBeVisible();
  await expect(feed.getByText("牛肉", { exact: true })).toBeVisible();

  // サムネ 2 枚が実際に描画された（proxy route がブラウザに解釈できるバイト列を返した事実）
  const thumbs = feed.locator("img[src*='/photos/']");
  await expect(thumbs).toHaveCount(2);
  await expect
    .poll(async () => thumbs.first().evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);
  const photoPaths = await thumbs.evaluateAll((els) =>
    els.map((el) => new URL((el as HTMLImageElement).src).pathname),
  );

  // 認可つき配信のヘッダ（private のみ・sniff 抑止）と、If-None-Match → 304 の条件つき GET
  const direct = await page.request.get(photoPaths[0]!);
  expect(direct.status()).toBe(200);
  expect(direct.headers()["content-type"]).toBe("image/jpeg");
  expect(direct.headers()["cache-control"]).toBe("private, max-age=3600");
  expect(direct.headers()["x-content-type-options"]).toBe("nosniff");
  const etag = direct.headers()["etag"];
  expect(etag).toBeTruthy();
  const conditional = await page.request.get(photoPaths[0]!, {
    headers: { "If-None-Match": etag! },
  });
  expect(conditional.status()).toBe(304);

  // lightbox で 1 枚目を拡大 → 削除（R2 → D1 の順で消え、route が 404 になる）
  await page.getByRole("button", { name: "肉じゃが の写真 1 を拡大" }).click();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "写真を削除" }).click();
  await expect(thumbs).toHaveCount(1);
  await expect.poll(async () => (await page.request.get(photoPaths[0]!)).status()).toBe(404);
  expect((await page.request.get(photoPaths[1]!)).status()).toBe(200);

  // またたべたいトグル → リロードで投稿もトグルも写真も残る（永続化はユニットでは検知不能）
  const mataButton = feed.getByRole("button", { name: /またたべたい/ });
  await expect(mataButton).toHaveAttribute("aria-pressed", "false");
  await mataButton.click();
  await expect(mataButton).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(feed.getByText("肉じゃが", { exact: true })).toBeVisible();
  await expect(feed.getByRole("button", { name: /またたべたい/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(feed.locator("img[src*='/photos/']")).toHaveCount(1);

  // 2 品目（タグは別）。サジェストの絞り込みが本当に絞っているかは 2 品ないと見えない
  await page.getByLabel("料理名").fill("カレー");
  await page.getByLabel("タグ").fill("にんじん");
  await page.getByRole("button", { name: "記録する" }).click();
  await expect(feed.getByText("カレー", { exact: true })).toBeVisible();

  // サジェスト: 料理名ごとの直近 1 件が札で出る（window 関数まで通っている事実）。
  // タグは AND で絞り込み、札を選ぶと前回のタグ・リンクがフォームに複製される
  const nikujaga = form.getByRole("button", { name: /肉じゃが/ });
  const curry = form.getByRole("button", { name: /カレー/ });
  await expect(nikujaga).toBeVisible();
  await expect(curry).toBeVisible();
  await form.locator("summary").click();
  await form.getByRole("button", { name: "じゃがいも" }).click();
  await expect(curry).toHaveCount(0);
  await expect(nikujaga).toBeVisible();
  // AND なので、両方を持つ記録は無い → どちらの札も消える
  await form.getByRole("button", { name: "にんじん" }).click();
  await expect(nikujaga).toHaveCount(0);
  await expect(form.getByText("このタグの記録はまだありません")).toBeVisible();
  await form.getByRole("button", { name: "にんじん" }).click();
  await nikujaga.click();
  await expect(page.getByLabel("料理名")).toHaveValue("肉じゃが");
  await expect(page.getByLabel("タグ")).toHaveValue("じゃがいも 牛肉");
  await expect(form.getByText(/「肉じゃが」の前回の内容を引き継ぎました/)).toBeVisible();

  // ふりかえり: またたべたい一覧（既定）→ ぜんぶの記録 + タグ AND → 料理名の期間集計、の配線。
  // ♥ は肉じゃがだけに付いている状態。意味の網羅はユニットに譲る
  await page.getByRole("link", { name: "ふりかえり" }).click();
  const records = page.getByRole("region", { name: "記録をさがす" });
  await expect(records.getByText("肉じゃが", { exact: true })).toBeVisible();
  await expect(records.getByText("カレー", { exact: true })).toHaveCount(0);
  await records.getByRole("button", { name: "ぜんぶの記録" }).click();
  await expect(records.getByText("カレー", { exact: true })).toBeVisible();
  await records.locator("summary").click();
  await records.getByRole("button", { name: "にんじん" }).click();
  await expect(records.getByText("肉じゃが", { exact: true })).toHaveCount(0);
  await expect(records.getByText("カレー", { exact: true })).toBeVisible();

  // 集計: 2 品が 1 回ずつ数えられ、期間を未来に絞ると 0 件、外すと戻る（BETWEEN の配線）
  const statsSection = page.getByRole("region", { name: "よく食べているもの" });
  await expect(statsSection.getByText("肉じゃが", { exact: true })).toBeVisible();
  await expect(statsSection.getByText("1 回")).toHaveCount(2);
  await statsSection.getByLabel("いつから").fill("2100-01-01");
  await expect(statsSection.getByText("この期間の記録はまだありません")).toBeVisible();
  await statsSection.getByLabel("いつから").fill("");
  await expect(statsSection.getByText("カレー", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "ホーム" }).click();
  await expect(feed.getByText("カレー", { exact: true })).toBeVisible();

  // カレーは用済み（残り 1 件にして、写真つきの削除を素のまま確かめる）
  page.once("dialog", (dialog) => void dialog.accept());
  await feed.getByRole("button", { name: /削除.*カレー/ }).click();
  await expect(feed.getByText("カレー", { exact: true })).toHaveCount(0);

  // 削除（confirm を受ける）。meal と一緒に残りの写真も消える（R2 object ごと）
  page.once("dialog", (dialog) => void dialog.accept());
  await feed.getByRole("button", { name: /削除/ }).click();
  await expect(feed.getByText("肉じゃが", { exact: true })).toHaveCount(0);
  await expect(page.getByText("まだ記録がありません", { exact: false })).toBeVisible();
  await expect.poll(async () => (await page.request.get(photoPaths[1]!)).status()).toBe(404);

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

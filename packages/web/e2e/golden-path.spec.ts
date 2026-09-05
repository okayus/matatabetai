import { expect, test } from "@playwright/test";
import { E2E_INITIAL_REGISTRATION_TOKEN } from "../playwright.config";
import { PNG_8x8 } from "./fixtures/png";
import { enableVirtualAuthenticator } from "./helpers/webauthn";

// 配線の事実: 初回登録（パスキー作成 → users/spaces/space_members/credentials/sessions）→
// リロードでセッションが残る → 記録フォーム（dialog）を開いて投稿作成（meals/tags/meal_tags +
// 写真 2 枚: 縮小 → R2 → proxy 配信・304）→ 写真 1 枚削除 → またたべたいトグル →
// リロードで投稿・トグル・写真が残る → サジェスト（料理名ごとの直近 1 件・タグ AND 絞り込み・
// リンク 2 種と作り方メモの引き継ぎ）→ ホームの検索（♥ / タグ AND / 料理名の部分一致、URL に残る）→
// ふりかえりの集計と、札・行からホームへの遷移 → 編集 → 削除（R2 も消える）→ 招待リンク発行 →
// 別ブラウザが招待から登録 → メンバーに並ぶ → ログアウト → パスキーでログインし直す。ドメインの意味はユニットに譲る。
test("register → reload → meal record with photos → suggestion → search → lookback → invite → second member → logout → login", async ({ page, browser, baseURL }) => {
  await enableVirtualAuthenticator(page);

  await page.goto("/register");
  await page.getByLabel("表示名").fill("e2e-owner");
  await page.getByLabel("登録トークン").fill(E2E_INITIAL_REGISTRATION_TOKEN);
  await page.getByLabel("この端末の名前（任意）").fill("virtual");
  await page.getByRole("button", { name: "パスキーを作って登録" }).click();

  // ホームの h1 は初回登録で作られたスペースの名前（ADR-009 §5）
  await expect(page.getByRole("heading", { name: "e2e-ownerの食卓" })).toBeVisible();

  // 永続化の事実: リロード後もログイン状態とスペースが残る
  await page.reload();
  await expect(page.getByRole("heading", { name: "e2e-ownerの食卓" })).toBeVisible();

  // 記録フォームは <dialog>（requirements 14）: ボタンで開き、送れたら閉じる。
  // サジェストの札と一覧は同じ料理名を出すので、dialog / feed で分ける
  const composer = page.getByRole("dialog", { name: "たべたものを記録" });
  const openComposer = () => page.getByRole("button", { name: "たべたものを記録する" }).click();
  const feed = page.getByRole("region", { name: "e2e-ownerの食卓" });
  // タイムラインの既定は写真だけ（requirements 15）。料理名・タグ・ボタンは くわしく にある。
  // 読み込み直すたび既定に戻るので、reload / ホームに戻るのあとで押し直す
  const showDetails = () => feed.getByRole("button", { name: "くわしく" }).click();
  // 記録に付いたタグの札。検索のタグ絞り込みにも同じ名前の chip があるので、行（listitem）の中で探す
  const tagBadge = (name: string) => feed.getByRole("listitem").getByText(name, { exact: true });

  // 投稿作成（meals / tags / meal_tags が繋がっている）+ 写真 2 枚。
  // setInputFiles の PNG をクライアントが canvas で JPEG に縮小してから multipart で送る
  await expect(composer).toBeHidden();
  await openComposer();
  await composer.getByLabel("料理名").fill("肉じゃが");
  await composer.getByLabel("タグ").fill("じゃがいも 牛肉");
  // リンク 2 種と作り方メモは併記できる（排他をやめた 3 項目 — ADR-007 §1）
  await composer.getByLabel("レシピ URL").fill("https://example.com/recipe/1");
  await composer.getByLabel("お店・商品 URL").fill("https://shop.example.com/item/1");
  await composer.getByLabel("作り方メモ").fill("みりんを少し多めに");
  await composer.getByLabel("写真", { exact: true }).setInputFiles([
    { name: "one.png", mimeType: "image/png", buffer: PNG_8x8 },
    { name: "two.png", mimeType: "image/png", buffer: PNG_8x8 },
  ]);
  await expect(composer.getByAltText("選択中の写真 2")).toBeVisible();
  await composer.getByRole("button", { name: "記録する" }).click();
  await expect(composer).toBeHidden();
  await showDetails();
  await expect(feed.getByText("肉じゃが", { exact: true })).toBeVisible();
  await expect(tagBadge("じゃがいも")).toBeVisible();
  await expect(tagBadge("牛肉")).toBeVisible();

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

  // またたべたいトグル → リロードで投稿もトグルも写真も残る（永続化はユニットでは検知不能）。
  // 検索の ♥ 札も「またたべたい」なので、行のボタンは読み上げ用の料理名で選ぶ
  const mataButton = feed.getByRole("button", { name: /またたべたい\s*（肉じゃが）/ });
  await expect(mataButton).toHaveAttribute("aria-pressed", "false");
  await mataButton.click();
  await expect(mataButton).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await showDetails();
  await expect(feed.getByText("肉じゃが", { exact: true })).toBeVisible();
  await expect(mataButton).toHaveAttribute("aria-pressed", "true");
  await expect(feed.locator("img[src*='/photos/']")).toHaveCount(1);
  // リンク 2 種と作り方メモも残る（recipe_url / shop_url は additive migration で足した列 — ADR-007 §2）
  await expect(feed.getByRole("link", { name: /^レシピ:/ })).toHaveAttribute(
    "href",
    "https://example.com/recipe/1",
  );
  await expect(feed.getByRole("link", { name: /^お店・商品:/ })).toHaveAttribute(
    "href",
    "https://shop.example.com/item/1",
  );
  await feed.locator("summary", { hasText: "作り方メモ" }).click();
  await expect(feed.getByText("みりんを少し多めに")).toBeVisible();

  // 2 品目（タグは別）。サジェストの絞り込みが本当に絞っているかは 2 品ないと見えない
  await openComposer();
  await composer.getByLabel("料理名").fill("カレー");
  await composer.getByLabel("タグ").fill("にんじん");
  await composer.getByRole("button", { name: "記録する" }).click();
  await expect(composer).toBeHidden();
  await expect(feed.getByText("カレー", { exact: true })).toBeVisible();

  // サジェスト: 料理名ごとの直近 1 件が札で出る（window 関数まで通っている事実）。
  // タグは AND で絞り込み、札を選ぶと前回のタグ・リンクがフォームに複製される
  await openComposer();
  const nikujaga = composer.getByRole("button", { name: /肉じゃが/ });
  const curry = composer.getByRole("button", { name: /カレー/ });
  await expect(nikujaga).toBeVisible();
  await expect(curry).toBeVisible();
  await composer.locator("summary", { hasText: "タグで絞り込む" }).click();
  await composer.getByRole("button", { name: "じゃがいも" }).click();
  await expect(curry).toHaveCount(0);
  await expect(nikujaga).toBeVisible();
  // AND なので、両方を持つ記録は無い → どちらの札も消える
  await composer.getByRole("button", { name: "にんじん" }).click();
  await expect(nikujaga).toHaveCount(0);
  await expect(composer.getByText("このタグの記録はまだありません")).toBeVisible();
  await composer.getByRole("button", { name: "にんじん" }).click();
  await nikujaga.click();
  await expect(composer.getByLabel("料理名")).toHaveValue("肉じゃが");
  await expect(composer.getByLabel("タグ")).toHaveValue("じゃがいも 牛肉");
  await expect(composer.getByLabel("レシピ URL")).toHaveValue("https://example.com/recipe/1");
  await expect(composer.getByLabel("お店・商品 URL")).toHaveValue("https://shop.example.com/item/1");
  await expect(composer.getByLabel("作り方メモ")).toHaveValue("みりんを少し多めに");
  await expect(composer.getByText(/「肉じゃが」の前回の内容を引き継ぎました/)).toBeVisible();
  // 送らずに閉じても入力は残る（開き直せば続きから）。焦点は開いたボタンへ戻る
  await composer.getByRole("button", { name: "閉じる" }).click();
  await expect(composer).toBeHidden();
  await expect(page.getByRole("button", { name: "たべたものを記録する" })).toBeFocused();
  await openComposer();
  await expect(composer.getByLabel("料理名")).toHaveValue("肉じゃが");
  await page.keyboard.press("Escape");
  await expect(composer).toBeHidden();

  // ホームの検索（requirements 15 / ADR-009）: ♥ → タグ AND → 料理名の部分一致 → 解除、の配線。
  // 絞り込みは URL のクエリに出て、リロードしても残る。♥ は肉じゃがだけに付いている状態。
  // 見せ方（くわしく）は絞り込みを変えても保たれる（同じ画面のまま読み直すだけ）
  const mataChip = feed.getByRole("button", { name: "またたべたい", exact: true });
  const searchBox = feed.getByRole("searchbox", { name: "料理名でさがす" });
  await mataChip.click();
  await expect(page).toHaveURL(/\?mataTabetai=1$/);
  await expect(feed.getByText("肉じゃが", { exact: true })).toBeVisible();
  await expect(feed.getByText("カレー", { exact: true })).toHaveCount(0);
  await mataChip.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(feed.getByText("カレー", { exact: true })).toBeVisible();
  await feed.locator("summary", { hasText: "タグで絞り込む" }).click();
  await feed.getByRole("button", { name: "にんじん" }).click();
  await expect(feed.getByText("肉じゃが", { exact: true })).toHaveCount(0);
  await expect(feed.getByText("カレー", { exact: true })).toBeVisible();
  // 料理名は「さがす」（Enter）で確定。タグ AND と合成される（にんじん × じゃが = 0 件）
  await searchBox.fill("じゃが");
  await searchBox.press("Enter");
  await expect(page).toHaveURL(/q=%E3%81%98%E3%82%83%E3%81%8C/);
  await expect(feed.getByText("この絞り込みに合う記録はまだありません")).toBeVisible();
  await feed.getByRole("button", { name: "にんじん" }).click();
  await expect(feed.getByText("肉じゃが", { exact: true })).toBeVisible();
  await expect(feed.getByText("カレー", { exact: true })).toHaveCount(0);
  // リロードしても絞り込みは残る（URL が持つ。引っ張り更新で検索が消えない）
  await page.reload();
  await expect(searchBox).toHaveValue("じゃが");
  await showDetails();
  await expect(feed.getByText("肉じゃが", { exact: true })).toBeVisible();
  await expect(feed.getByText("カレー", { exact: true })).toHaveCount(0);
  // 欄を空にした瞬間に解除される（「さがす」を待たない）
  await searchBox.fill("");
  await expect(page).toHaveURL(/\/$/);
  await expect(feed.getByText("カレー", { exact: true })).toBeVisible();
  await expect(feed.getByRole("button", { name: "絞り込みを解除" })).toHaveCount(0);

  // ふりかえりは集計だけ（ADR-009 §3）: 既定の今月に 2 品が 1 回ずつ数えられ、同じ期間のタグがクラウドに出る。
  // ← で先月に移ると 0 件、→ で戻る（プリセットが from / to を組んで両方の集計に渡している配線）
  await page.getByRole("link", { name: "ふりかえり" }).click();
  await expect(page.getByRole("region", { name: "記録をさがす" })).toHaveCount(0);
  const statsSection = page.getByRole("region", { name: "食べたもののまとめ" });
  await expect(statsSection.getByText("肉じゃが", { exact: true })).toBeVisible();
  await expect(statsSection.getByText("1 回", { exact: true })).toHaveCount(2);
  await expect(statsSection.getByRole("link", { name: /じゃがいも/ })).toBeVisible();
  await statsSection.getByRole("button", { name: "前の月" }).click();
  await expect(statsSection.getByText("この期間の記録はまだありません")).toBeVisible();
  await statsSection.getByRole("button", { name: "次の月" }).click();
  await expect(statsSection.getByText("カレー", { exact: true })).toBeVisible();
  // 日付を直に渡す口も残っている（プリセットに置き換えたのは既定の操作だけ）
  await statsSection.getByRole("button", { name: "日付を指定" }).click();
  await statsSection.getByLabel("いつから").fill("2100-01-01");
  await expect(statsSection.getByText("この期間の記録はまだありません")).toBeVisible();
  await statsSection.getByRole("button", { name: "今月" }).click();

  // クラウドの札はホームへの入口: そのタグ 1 つで絞られたホームが開く（♥ の枠は無いので、
  // ♡ の付いていないカレーが出る）。ページ間の遷移なので「戻る」でふりかえりに戻れる
  await statsSection.getByRole("link", { name: /にんじん/ }).click();
  await expect(page).toHaveURL(/\/\?tags=%E3%81%AB%E3%82%93%E3%81%98%E3%82%93$/);
  await showDetails();
  await expect(feed.getByText("カレー", { exact: true })).toBeVisible();
  await expect(feed.getByText("肉じゃが", { exact: true })).toHaveCount(0);
  await page.goBack();
  await expect(statsSection.getByText("1 回", { exact: true })).toHaveCount(2);
  // ランキングの料理名もホームへ（q の部分一致）
  await statsSection.getByRole("link", { name: "肉じゃが" }).click();
  await expect(page).toHaveURL(/\/\?q=%E8%82%89%E3%81%98%E3%82%83%E3%81%8C$/);
  await expect(searchBox).toHaveValue("肉じゃが");
  await showDetails();
  await expect(feed.getByText("肉じゃが", { exact: true })).toBeVisible();
  await expect(feed.getByText("カレー", { exact: true })).toHaveCount(0);
  // 「ホーム」は素の壁（絞り込みなし）。同じ画面のままなので くわしく は保たれている
  await page.getByRole("link", { name: "ホーム" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(searchBox).toHaveValue("");
  await expect(feed.getByText("カレー", { exact: true })).toBeVisible();

  // 編集（requirements 11 / ADR-008）: 行がその場でフォームになり、内容の全置き換えで保存する。
  // タグは張り替え（消したタグは外れる）、写真は保存を待たずその場で足せる
  await feed.getByRole("button", { name: /編集.*肉じゃが/ }).click();
  const editForm = page.getByRole("form", { name: "記録を編集" });
  await expect(editForm.getByLabel("料理名")).toHaveValue("肉じゃが");
  await expect(editForm.getByLabel("タグ")).toHaveValue("じゃがいも 牛肉");
  await expect(editForm.getByLabel("作り方メモ")).toHaveValue("みりんを少し多めに");
  await editForm.getByLabel("料理名").fill("肉じゃがリメイク");
  await editForm.getByLabel("タグ").fill("じゃがいも 玉ねぎ");
  await editForm.getByLabel("ひとことメモ").fill("翌日のほうがおいしい");
  await editForm.getByLabel("写真", { exact: true }).setInputFiles([
    { name: "three.png", mimeType: "image/png", buffer: PNG_8x8 },
  ]);
  await expect(editForm.locator("img[src*='/photos/']")).toHaveCount(2);
  await editForm.getByRole("button", { name: "保存する" }).click();
  await expect(editForm).toHaveCount(0);

  // 永続化と、直していないものが動いていない事実（♥・写真・リンク・作り方メモは body に無い）
  await page.reload();
  await showDetails();
  await expect(feed.getByText("肉じゃがリメイク", { exact: true })).toBeVisible();
  await expect(feed.getByText("翌日のほうがおいしい")).toBeVisible();
  await expect(tagBadge("玉ねぎ")).toBeVisible();
  await expect(tagBadge("牛肉")).toHaveCount(0);
  await expect(feed.locator("img[src*='/photos/']")).toHaveCount(2);
  await expect(
    feed.getByRole("button", { name: /またたべたい\s*（肉じゃがリメイク）/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(feed.getByRole("link", { name: /^レシピ:/ })).toHaveAttribute(
    "href",
    "https://example.com/recipe/1",
  );

  // カレーは用済み（残り 1 件にして、写真つきの削除を素のまま確かめる）
  page.once("dialog", (dialog) => void dialog.accept());
  await feed.getByRole("button", { name: /削除.*カレー/ }).click();
  await expect(feed.getByText("カレー", { exact: true })).toHaveCount(0);

  // 削除（confirm を受ける）。meal と一緒に残りの写真も消える（R2 object ごと）
  page.once("dialog", (dialog) => void dialog.accept());
  await feed.getByRole("button", { name: /削除/ }).click();
  await expect(feed.getByText("肉じゃがリメイク", { exact: true })).toHaveCount(0);
  await expect(page.getByText("まだ記録がありません", { exact: false })).toBeVisible();
  await expect.poll(async () => (await page.request.get(photoPaths[1]!)).status()).toBe(404);

  // 招待リンクを発行（スペース一覧と設定への入口はアカウントにある — ADR-009 §5）
  await page.getByRole("link", { name: "アカウント" }).click();
  await expect(page.getByText("オーナー", { exact: true })).toBeVisible();
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
  // 参加したスペースの壁が開く。役割はアカウントのスペース一覧で見える
  await expect(page2.getByRole("heading", { name: "e2e-ownerの食卓" })).toBeVisible();
  await page2.getByRole("link", { name: "アカウント" }).click();
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
  await expect(page.getByRole("heading", { name: "e2e-ownerの食卓" })).toBeVisible();
});

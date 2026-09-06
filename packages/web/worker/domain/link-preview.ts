import { z } from "zod";
import type { MealLinks } from "./meal";

// リンクとその URL プレビュー（ADR-007 §3-6、複数化は ADR-010）のドメイン。
// 取得そのもの（fetch / HTMLRewriter）は境界に置き、ここには「拾った候補 → 保存する値」
// 「行 → 表示する状態」「保存済み + 入力 → 足し引きの計画」の純粋な変換だけを置く。
// HTMLRewriter は workerd の API で vitest（Node）には無いので、意味の検査はこの層で固定する。

export const LINK_PREVIEW_KINDS = ["recipe", "shop"] as const;
export type LinkPreviewKind = (typeof LINK_PREVIEW_KINDS)[number];
export const LinkPreviewKind = z.enum(LINK_PREVIEW_KINDS);

// 取得中 / 成功 / 失敗 のいずれか。pending と failed は見た目が同じ（プレーンリンク）だが、
// 「まだ」と「もう無理」は別の事実なので畳まない（ADR-007 §5）。
// kind と URL はリンクそのものが持つので、この DU はスナップショットの状態だけを表す
export type LinkPreview =
  | { status: "pending" }
  | {
      status: "ok";
      title: string;
      description: string | null;
      siteName: string | null;
      hasImage: boolean;
    }
  | { status: "failed" };

// 貼られた URL 1 本。id は行の id（配信 URL と R2 キーに使う）で、行は不変（ADR-010 §1）
export type MealLink = {
  id: string;
  kind: LinkPreviewKind;
  url: string;
  preview: LinkPreview;
};

// これから立てる行。id は境界（コマンド）が採るので、純粋なこちらには無い
export type PlannedLink = { kind: LinkPreviewKind; url: string; position: number };

// 立てたばかりの行（id を採ったあと）。取りに行く先でもあり、投稿の応答に載せる姿でもある
export type NewLink = PlannedLink & { id: string };

// 取りに行く先（立てた行の id 付き）
export type LinkPreviewTarget = { id: string; url: string };

// 立てたばかりの行 → 表示するリンク。取得はこれから走るので、どれも「取得中」
export function pendingMealLink({ id, kind, url }: NewLink): MealLink {
  return { id, kind, url, preview: { status: "pending" } };
}

// 入力の URL 欄 → 立てるべき行。レシピ → お店・商品 の順に、それぞれ入力の並びで番号を振る。
// 作り方メモは URL ではないので対象外（MealLinks の 3 項目のうち 2 つ）
export function plannedLinks(links: MealLinks): PlannedLink[] {
  return LINK_PREVIEW_KINDS.flatMap((kind) =>
    urlsOfKind(links, kind).map((url, position) => ({ kind, url, position })),
  );
}

export function urlsOfKind(links: MealLinks, kind: LinkPreviewKind): readonly string[] {
  return kind === "recipe" ? links.recipeUrls : links.shopUrls;
}

// R2 キーは拡張子なし（photoKeys と同じ流儀 — content type は object の httpMetadata が持つ）。
// spaceId / mealId 接頭辞で 1 家族・1 投稿ぶんを list / 削除できる（ADR-007 §4）。
// 末尾は行の id — 行は不変（URL が変われば別の行）で 1 行につき取得は 1 回しか走らないので、
// ADR-008 §6 が付けていた取得ごとのランダム id は要らない（ADR-010 §1）。
// 配信も削除も行の image_r2_key を読むので、キーの形はここだけの話で済む
export function linkPreviewImageKey(spaceId: string, mealId: string, linkId: string): string {
  return `ogp/${spaceId}/${mealId}/${linkId}`;
}

// 保存済みの行のうち、編集の足し引きを決めるのに要る分
export type SavedLink = {
  id: string;
  kind: LinkPreviewKind;
  url: string;
  position: number;
  imageR2Key: string | null;
};

// 編集で保存済みのリンクをどうするか（ADR-008 §5 を URL 単位に読み替え — ADR-010 §4）。
// 同じ (kind, url) の行はスナップショットを投稿時点の姿のまま残し、消えた URL だけ捨てて、
// 増えた URL だけ取りに行く
export type LinkPlan = {
  // URL は同じで並びだけ変わった行（カードはそのまま、position だけ書き直す）
  repositioned: { id: string; position: number }[];
  // 消す行（入力から URL が消えた）
  removedIds: string[];
  // 消す R2 object（捨てる行が画像を持っていた分だけ）
  staleImageKeys: string[];
  // 立てる pending 行 = これから取りに行く先（id は境界で採る）
  added: PlannedLink[];
};

export function planLinks(saved: readonly SavedLink[], links: MealLinks): LinkPlan {
  const plan: LinkPlan = { repositioned: [], removedIds: [], staleImageKeys: [], added: [] };
  // 同じ (kind, url) の行が複数あることは無い（入力は uniqueUrls で畳んである）
  const remaining = new Map(saved.map((row) => [`${row.kind}\n${row.url}`, row]));
  for (const planned of plannedLinks(links)) {
    const row = remaining.get(`${planned.kind}\n${planned.url}`);
    if (row === undefined) {
      plan.added.push(planned);
      continue;
    }
    remaining.delete(`${planned.kind}\n${planned.url}`);
    if (row.position !== planned.position) {
      plan.repositioned.push({ id: row.id, position: planned.position });
    }
  }
  // 入力に残らなかった行が捨てる分
  for (const row of remaining.values()) {
    plan.removedIds.push(row.id);
    if (row.imageR2Key !== null) plan.staleImageKeys.push(row.imageR2Key);
  }
  return plan;
}

// HTMLRewriter が拾う生の候補。og:* が無いページのために <title> も持つ
export type OgpCandidates = {
  ogTitle: string | null;
  ogDescription: string | null;
  ogSiteName: string | null;
  ogImage: string | null;
  htmlTitle: string | null;
};

// 保存する値。title があることが「カードになる」の条件（見出しの無いカードは出しようがない）
export type LinkPreviewSnapshot = {
  title: string;
  description: string | null;
  siteName: string | null;
  imageUrl: string | null;
};

// 保存する長さの上限。他人のページの文字列をそのまま持つので、行が肥らない長さで切る
export const MAX_TITLE_CHARS = 120;
export const MAX_DESCRIPTION_CHARS = 300;
export const MAX_SITE_NAME_CHARS = 60;

// 相対 URL（og:image は `/img/x.jpg` のことが多い）をページ URL で解決し、http(s) だけ通す。
// リダイレクトの Location も同じ規則で辿る
export function absoluteHttpUrl(value: string, baseUrl: string): string | null {
  try {
    const u = new URL(value, baseUrl);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

// 制御文字と連続する空白を 1 つの半角スペースに畳む（改行つきの og:description をカードに載せるため）
function clean(value: string | null): string | null {
  if (value === null) return null;
  const collapsed = value.replace(/[\p{Cc}\s]+/gu, " ").trim();
  return collapsed === "" ? null : collapsed;
}

function truncate(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length <= max ? value : `${chars.slice(0, max).join("")}…`;
}

function field(value: string | null, max: number): string | null {
  const cleaned = clean(value);
  return cleaned === null ? null : truncate(cleaned, max);
}

// 候補 → 保存する値。見出し（og:title か <title>）が取れなければ null = 失敗扱いで、
// リンクはプレーンなまま（ADR-007 §5）。画像は取れたら添える、程度のもの
export function toSnapshot(
  candidates: OgpCandidates,
  pageUrl: string,
): LinkPreviewSnapshot | null {
  const title = field(candidates.ogTitle, MAX_TITLE_CHARS) ?? field(candidates.htmlTitle, MAX_TITLE_CHARS);
  if (title === null) return null;
  const image = clean(candidates.ogImage);
  return {
    title,
    description: field(candidates.ogDescription, MAX_DESCRIPTION_CHARS),
    siteName: field(candidates.ogSiteName, MAX_SITE_NAME_CHARS),
    imageUrl: image === null ? null : absoluteHttpUrl(image, pageUrl),
  };
}

export type MealLinkRow = {
  id: string;
  kind: LinkPreviewKind;
  url: string;
  position: number;
  status: "pending" | "ok" | "failed";
  title: string | null;
  description: string | null;
  siteName: string | null;
  imageR2Key: string | null;
};

// 行 → 表示するリンク。列は「status と title が食い違う」形（取得の途中で死んだ残骸）を
// 表現できてしまうので、DU に持ち上げるここで failed に倒して不正な状態を外に出さない
export function toMealLink(row: MealLinkRow): MealLink {
  const { id, kind, url } = row;
  return { id, kind, url, preview: toPreview(row) };
}

function toPreview(row: MealLinkRow): LinkPreview {
  if (row.status === "pending") return { status: "pending" };
  if (row.status === "ok" && row.title !== null) {
    return {
      status: "ok",
      title: row.title,
      description: row.description,
      siteName: row.siteName,
      hasImage: row.imageR2Key !== null,
    };
  }
  return { status: "failed" };
}

// 一覧では レシピ → お店・商品 の順、その中は position 順に出す（フォームの並びと同じ）。
// kind の文字列順に頼らず、LINK_PREVIEW_KINDS を並びの正典にする
export function sortLinks<T extends { kind: LinkPreviewKind; position: number }>(items: T[]): T[] {
  return items.sort(
    (a, b) =>
      LINK_PREVIEW_KINDS.indexOf(a.kind) - LINK_PREVIEW_KINDS.indexOf(b.kind) ||
      a.position - b.position,
  );
}

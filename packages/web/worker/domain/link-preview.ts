import { z } from "zod";
import type { MealLinks } from "./meal";

// URL プレビュー（ADR-007 §3-6）のドメイン。取得そのもの（fetch / HTMLRewriter）は境界に置き、
// ここには「拾った候補 → 保存する値」「行 → 表示する状態」の純粋な変換だけを置く。
// HTMLRewriter は workerd の API で vitest（Node）には無いので、意味の検査はこの層で固定する。

export const LINK_PREVIEW_KINDS = ["recipe", "shop"] as const;
export type LinkPreviewKind = (typeof LINK_PREVIEW_KINDS)[number];
export const LinkPreviewKind = z.enum(LINK_PREVIEW_KINDS);

// 取得中 / 成功 / 失敗 のいずれか。pending と failed は見た目が同じ（プレーンリンク）だが、
// 「まだ」と「もう無理」は別の事実なので畳まない（ADR-007 §5）
export type LinkPreview =
  | { kind: LinkPreviewKind; status: "pending" }
  | {
      kind: LinkPreviewKind;
      status: "ok";
      title: string;
      description: string | null;
      siteName: string | null;
      hasImage: boolean;
    }
  | { kind: LinkPreviewKind; status: "failed" };

export type LinkPreviewTarget = { kind: LinkPreviewKind; url: string };

// プレビューを取りに行く先。作り方メモは URL ではないので対象外（MealLinks の 3 項目のうち 2 つ）
export function linkPreviewTargets(links: MealLinks): LinkPreviewTarget[] {
  const targets: LinkPreviewTarget[] = [];
  if (links.recipeUrl !== null) targets.push({ kind: "recipe", url: links.recipeUrl });
  if (links.shopUrl !== null) targets.push({ kind: "shop", url: links.shopUrl });
  return targets;
}

// R2 キーは拡張子なし（photoKeys と同じ流儀 — content type は object の httpMetadata が持つ）。
// spaceId / mealId 接頭辞で 1 家族・1 投稿ぶんを list / 削除できる（ADR-007 §4）
export function linkPreviewImageKey(
  spaceId: string,
  mealId: string,
  kind: LinkPreviewKind,
): string {
  return `ogp/${spaceId}/${mealId}/${kind}`;
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

export type LinkPreviewRow = {
  kind: LinkPreviewKind;
  status: "pending" | "ok" | "failed";
  title: string | null;
  description: string | null;
  siteName: string | null;
  imageR2Key: string | null;
};

// 行 → 表示する状態。列は「status と title が食い違う」形（取得の途中で死んだ残骸）を
// 表現できてしまうので、DU に持ち上げるここで failed に倒して不正な状態を外に出さない
export function toLinkPreview(row: LinkPreviewRow): LinkPreview {
  const { kind } = row;
  if (row.status === "pending") return { kind, status: "pending" };
  if (row.status === "ok" && row.title !== null) {
    return {
      kind,
      status: "ok",
      title: row.title,
      description: row.description,
      siteName: row.siteName,
      hasImage: row.imageR2Key !== null,
    };
  }
  return { kind, status: "failed" };
}

// 一覧では レシピ → お店・商品 の順に出す（フォームの並びと同じ）。
// kind の文字列順に頼らず、この配列を並びの正典にする
export function sortByKind<T extends { kind: LinkPreviewKind }>(items: T[]): T[] {
  return items.sort(
    (a, b) => LINK_PREVIEW_KINDS.indexOf(a.kind) - LINK_PREVIEW_KINDS.indexOf(b.kind),
  );
}

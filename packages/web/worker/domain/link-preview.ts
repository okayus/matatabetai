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
// spaceId / mealId 接頭辞で 1 家族・1 投稿ぶんを list / 削除できる（ADR-007 §4）。
// 末尾の imageId は取得ごとに固有（ADR-008 §6）— 編集で同じ (meal, kind) の取得が 2 本走ったとき、
// キーが同じだと負けたジョブの補償削除が勝ったジョブの画像を消す。配信も削除も行の
// image_r2_key を読むので、キーの形はここだけの話で済む
export function linkPreviewImageKey(
  spaceId: string,
  mealId: string,
  kind: LinkPreviewKind,
  imageId: string,
): string {
  return `ogp/${spaceId}/${mealId}/${kind}/${imageId}`;
}

// 保存済みのプレビュー行のうち、編集で「同じ URL か」を判定するのに要る分
export type SavedLinkPreview = { kind: LinkPreviewKind; url: string; imageR2Key: string | null };

// 編集で保存済みのプレビューをどうするか（ADR-008 §5）。URL が変わっていなければ
// スナップショットは投稿時点の姿のまま残し、変わった / 消えたときだけ捨てて取り直す
export type LinkPreviewPlan = {
  // 消す行（URL が変わった / URL 自体が消えた）
  staleKinds: LinkPreviewKind[];
  // 消す R2 object（捨てる行が画像を持っていた分だけ）
  staleImageKeys: string[];
  // 立て直す pending 行 = これから取りに行く先
  targets: LinkPreviewTarget[];
};

export function planLinkPreviews(
  saved: readonly SavedLinkPreview[],
  links: MealLinks,
): LinkPreviewPlan {
  const plan: LinkPreviewPlan = { staleKinds: [], staleImageKeys: [], targets: [] };
  const next = new Map(linkPreviewTargets(links).map((t) => [t.kind, t.url]));
  for (const kind of LINK_PREVIEW_KINDS) {
    const row = saved.find((r) => r.kind === kind) ?? null;
    const url = next.get(kind) ?? null;
    // 同じ URL は触らない（カードは投稿時点の姿のまま — ADR-007 §3）
    if (row !== null && row.url === url) continue;
    if (row !== null) {
      plan.staleKinds.push(kind);
      if (row.imageR2Key !== null) plan.staleImageKeys.push(row.imageR2Key);
    }
    if (url !== null) plan.targets.push({ kind, url });
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

import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { err, ok, type Result } from "neverthrow";

export type Role = "owner" | "member";
export type SpaceSummary = {
  id: string;
  name: string;
  role: Role;
  memberCount: number;
  createdAt: string;
};
export type Me = { id: string; displayName: string; spaces: SpaceSummary[] };
export type Member = { userId: string; displayName: string; role: Role; joinedAt: string };
export type SpaceDetail = {
  id: string;
  name: string;
  createdAt: string;
  role: Role;
  members: Member[];
};
export type PendingInvite = {
  id: string;
  expiresAt: string;
  createdByUserId: string;
  createdAt: string;
};
export type IssuedInvite = { inviteId: string; expiresAt: string; url: string };
export type Credential = {
  id: string;
  deviceName: string | null;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
// レシピ URL / お店・商品 URL / 作り方メモ は独立した任意の 3 項目（併用可 — ADR-007 §1）
export type MealLinks = {
  recipeUrl: string | null;
  shopUrl: string | null;
  recipeMemo: string | null;
};
export type MealTag = { id: string; name: string };
// URL プレビューは投稿時のスナップショット（ADR-007 §3）。取得中・失敗はカードにせず
// プレーンリンクのまま出す（3 状態のうち ok だけが見た目を変える — ADR-007 §5）
export type LinkPreviewKind = "recipe" | "shop";
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
// width / height は縮小後の本体寸法。<img> の寸法予約（CLS 回避）に使う
export type MealPhoto = {
  id: string;
  width: number;
  height: number;
  hasThumb: boolean;
  createdAt: string;
};
export type Meal = MealLinks & {
  id: string;
  name: string;
  eatenOn: string;
  mealType: MealType | null;
  note: string | null;
  mataTabetai: boolean;
  tags: MealTag[];
  photos: MealPhoto[];
  previews: LinkPreview[];
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
};
// 料理名の期間集計の 1 行（requirements 7）。name は直近 1 件の表記、♥ は期間内のどれかに付いていれば真
export type MealNameStat = {
  name: string;
  count: number;
  lastEatenOn: string;
  mataTabetai: boolean;
};
// 食材タグの期間集計（タグクラウド）。多い順に上位だけ返る
export type MealTagStat = { id: string; name: string; count: number };
// 投稿フォームのサジェスト（requirements 8）。料理名ごとに直近 1 件、選ぶと前回のリンク・作り方メモ・タグを引き継ぐ
export type MealSuggestion = MealLinks & {
  mealId: string;
  name: string;
  lastEatenOn: string;
  mataTabetai: boolean;
  tags: MealTag[];
  photo: { id: string; hasThumb: boolean } | null;
};
export type CreateMealBody = MealLinks & {
  name: string;
  eatenOn: string;
  mealType: MealType | null;
  note: string | null;
  tags: string[];
};

export type ApiFailure =
  | { kind: "http"; status: number; type: string; message: string }
  | { kind: "network"; message: string };

// 401 は「セッションが切れた」の合図。どの呼び出しからでも AuthProvider に伝える
export const UNAUTHORIZED_EVENT = "matatabetai:unauthorized";

async function toResult<T>(res: Response): Promise<Result<T, ApiFailure>> {
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as {
      error?: { type?: string; message?: string };
    };
    if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    return err({
      kind: "http",
      status: res.status,
      type: j.error?.type ?? "unknown",
      message: j.error?.message ?? `HTTP ${res.status}`,
    });
  }
  return ok((await res.json()) as T);
}

// 同一オリジンの fetch: cookie は自動で付き、非 GET には Origin が付く（サーバーの CSRF 検査）
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<Result<T, ApiFailure>> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? "GET",
      ...(init.body === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(init.body) }),
    });
  } catch (e) {
    return err({ kind: "network", message: e instanceof Error ? e.message : String(e) });
  }
  return toResult(res);
}

const post = <T>(path: string, body?: unknown) => api<T>(path, { method: "POST", body });
const patch = <T>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body });
const del = <T>(path: string) => api<T>(path, { method: "DELETE" });

// --- auth ---------------------------------------------------------------------------------
export const me = () => api<Me>("/api/auth/me");
export const logout = () => post<Record<string, never>>("/api/auth/logout");
export const updateMe = (displayName: string) =>
  patch<{ id: string; displayName: string }>("/api/auth/me", { displayName });

export const registerBegin = (input: {
  displayName: string;
  initialRegistrationToken?: string;
  inviteToken?: string;
}) => post<{ options: PublicKeyCredentialCreationOptionsJSON }>("/api/auth/register/begin", input);
export const registerVerify = (response: RegistrationResponseJSON, deviceName: string | null) =>
  post<{ id: string; displayName: string; spaceId: string }>("/api/auth/register/verify", {
    response,
    deviceName,
  });

export const loginBegin = () =>
  post<{ options: PublicKeyCredentialRequestOptionsJSON }>("/api/auth/login/begin");
export const loginVerify = (response: AuthenticationResponseJSON) =>
  post<{ id: string; displayName: string }>("/api/auth/login/verify", { response });

export const listCredentials = () => api<Credential[]>("/api/auth/credentials");
export const addCredentialBegin = (deviceName: string | null) =>
  post<{ options: PublicKeyCredentialCreationOptionsJSON }>("/api/auth/credentials/add/begin", {
    deviceName,
  });
export const addCredentialVerify = (response: RegistrationResponseJSON, deviceName: string | null) =>
  post<{ id: string }>("/api/auth/credentials/add/verify", { response, deviceName });
export const renameCredential = (id: string, deviceName: string) =>
  patch<{ id: string; deviceName: string }>(`/api/auth/credentials/${encodeURIComponent(id)}`, {
    deviceName,
  });
export const deleteCredential = (id: string) =>
  del<Record<string, never>>(`/api/auth/credentials/${encodeURIComponent(id)}`);

// --- spaces -------------------------------------------------------------------------------
export const listSpaces = () => api<SpaceSummary[]>("/api/spaces");
export const createSpace = (name: string) => post<{ id: string; name: string }>("/api/spaces", { name });
export const getSpace = (spaceId: string) => api<SpaceDetail>(`/api/spaces/${spaceId}`);
export const renameSpace = (spaceId: string, name: string) =>
  patch<{ id: string; name: string }>(`/api/spaces/${spaceId}`, { name });
export const removeMember = (spaceId: string, userId: string) =>
  del<Record<string, never>>(`/api/spaces/${spaceId}/members/${userId}`);

// --- meals --------------------------------------------------------------------------------
// tags は AND（同じ名前を繰り返して渡す）、mataTabetai は「またたべたい」だけに絞る
export type MealListFilter = {
  tags?: readonly string[] | undefined;
  mataTabetai?: boolean | undefined;
};
export const listMeals = (spaceId: string, filter: MealListFilter = {}) => {
  const params = new URLSearchParams((filter.tags ?? []).map((name) => ["tags", name]));
  if (filter.mataTabetai) params.set("mataTabetai", "1");
  const query = params.toString();
  return api<Meal[]>(`/api/spaces/${spaceId}/meals${query ? `?${query}` : ""}`);
};
// 料理名の期間集計。from / to は YYYY-MM-DD で任意（無指定は全期間）、両端を含む
export const listMealStats = (
  spaceId: string,
  range: { from?: string | undefined; to?: string | undefined } = {},
) => {
  const params = new URLSearchParams();
  if (range.from) params.set("from", range.from);
  if (range.to) params.set("to", range.to);
  const query = params.toString();
  return api<MealNameStat[]>(`/api/spaces/${spaceId}/meals/stats${query ? `?${query}` : ""}`);
};
// タグクラウド。期間の読みは listMealStats と同じ（プリセットが同じ範囲を両方に渡す）
export const listMealTagStats = (
  spaceId: string,
  range: { from?: string | undefined; to?: string | undefined } = {},
) => {
  const params = new URLSearchParams();
  if (range.from) params.set("from", range.from);
  if (range.to) params.set("to", range.to);
  const query = params.toString();
  return api<MealTagStat[]>(`/api/spaces/${spaceId}/meals/tag-stats${query ? `?${query}` : ""}`);
};
export const createMeal = (spaceId: string, body: CreateMealBody) =>
  post<Meal>(`/api/spaces/${spaceId}/meals`, body);
export const setMataTabetai = (spaceId: string, mealId: string, mataTabetai: boolean) =>
  patch<{ id: string; mataTabetai: boolean; updatedAt: string }>(
    `/api/spaces/${spaceId}/meals/${mealId}`,
    { mataTabetai },
  );
export const deleteMeal = (spaceId: string, mealId: string) =>
  del<Record<string, never>>(`/api/spaces/${spaceId}/meals/${mealId}`);
// タグは同じ名前を繰り返して渡す（?tags=a&tags=b の AND 絞り込み）
export const listMealSuggestions = (spaceId: string, tagNames: readonly string[]) => {
  const query = new URLSearchParams(tagNames.map((name) => ["tags", name])).toString();
  return api<MealSuggestion[]>(`/api/spaces/${spaceId}/meals/suggestions${query ? `?${query}` : ""}`);
};
export const listSpaceTags = (spaceId: string) => api<MealTag[]>(`/api/spaces/${spaceId}/tags`);

// --- meal photos --------------------------------------------------------------------------
// 写真は private R2 を Worker 経由で配る。<img src> は同一オリジンなので cookie が自動で付く
export const mealPhotoUrl = (
  spaceId: string,
  mealId: string,
  photoId: string,
  variant?: "thumb",
) =>
  `/api/spaces/${spaceId}/meals/${mealId}/photos/${photoId}${variant === "thumb" ? "?variant=thumb" : ""}`;

// FormData は素の fetch で送る（boundary は fetch が付ける。Content-Type を手で書かない）
export async function uploadMealPhoto(
  spaceId: string,
  mealId: string,
  photo: { full: { blob: Blob; width: number; height: number }; thumb: { blob: Blob } },
): Promise<Result<MealPhoto, ApiFailure>> {
  const fd = new FormData();
  fd.append("file", photo.full.blob, "photo.jpg");
  fd.append("thumb", photo.thumb.blob, "thumb.jpg");
  fd.append("width", String(photo.full.width));
  fd.append("height", String(photo.full.height));
  let res: Response;
  try {
    res = await fetch(`/api/spaces/${spaceId}/meals/${mealId}/photos`, {
      method: "POST",
      body: fd,
    });
  } catch (e) {
    return err({ kind: "network", message: e instanceof Error ? e.message : String(e) });
  }
  return toResult(res);
}

export const deleteMealPhoto = (spaceId: string, mealId: string, photoId: string) =>
  del<Record<string, never>>(`/api/spaces/${spaceId}/meals/${mealId}/photos/${photoId}`);

// プレビューの og:image も private R2 を Worker 経由で配る（写真と同じ流儀。URL は id から組む）
export const linkPreviewImageUrl = (spaceId: string, mealId: string, kind: LinkPreviewKind) =>
  `/api/spaces/${spaceId}/meals/${mealId}/link-previews/${kind}/image`;

export const listInvites = (spaceId: string) => api<PendingInvite[]>(`/api/spaces/${spaceId}/invites`);
export const issueInvite = (spaceId: string) => post<IssuedInvite>(`/api/spaces/${spaceId}/invites`);
export const revokeInvite = (spaceId: string, inviteId: string) =>
  del<Record<string, never>>(`/api/spaces/${spaceId}/invites/${inviteId}`);
export const acceptInvite = (token: string) => post<{ spaceId: string }>("/api/invites/accept", { token });

// 画面に出す日本語。type はサーバーの AppError["type"]
export function describeFailure(f: ApiFailure): string {
  if (f.kind === "network") return "通信できませんでした。電波の良いところでもう一度試してください。";
  switch (f.type) {
    case "registration_closed":
      return "登録は受け付けていません。登録トークンを確認してください。";
    case "invite_invalid":
      return "この招待リンクは無効です。";
    case "invite_consumed":
      return "この招待リンクはもう使われています。新しいリンクをもらってください。";
    case "invite_expired":
      return "この招待リンクは期限切れです。新しいリンクをもらってください。";
    case "invite_race":
      return "同じ招待が同時に使われました。新しいリンクをもらってください。";
    case "already_member":
      return "すでにこのスペースのメンバーです。";
    case "already_owner":
      return "自分のスペースはすでにあります（作れるのは 1 つだけ）。";
    case "last_credential":
      return "最後のパスキーは削除できません。先に別の端末を追加してください。";
    case "last_owner":
      return "最後のオーナーは外せません。";
    case "forbidden":
      return "この操作はオーナーだけができます。";
    case "not_found":
      return "見つかりませんでした。";
    case "challenge_mismatch":
      return "パスキーの確認に失敗しました。もう一度やり直してください。";
    case "photo_too_large":
      return "写真が大きすぎます（10 MB まで）。";
    case "photo_type_not_allowed":
      return "この形式の写真には対応していません（JPEG / PNG / WebP）。iPhone は 設定 → カメラ → フォーマット → 互換性優先 にすると確実です。";
    case "validation_error":
      return `入力を確認してください（${f.message}）`;
    case "unauthorized":
    case "session_expired":
      return "ログインし直してください。";
    default:
      return `エラーが起きました（${f.type}）`;
  }
}

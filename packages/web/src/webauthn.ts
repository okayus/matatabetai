import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { err, ok, type Result } from "neverthrow";

// ブラウザ標準の JSON API（parseCreationOptionsFromJSON / parseRequestOptionsFromJSON / toJSON、
// Baseline 2025-03）を直接呼ぶ。ラッパーライブラリは使わない（modern-web-guidance passkeys）。
// Signal API は対応ブラウザだけで呼ぶ（Firefox 未対応）。
type PublicKeyCredentialStatics = {
  parseCreationOptionsFromJSON?: (
    json: PublicKeyCredentialCreationOptionsJSON,
  ) => PublicKeyCredentialCreationOptions;
  parseRequestOptionsFromJSON?: (
    json: PublicKeyCredentialRequestOptionsJSON,
  ) => PublicKeyCredentialRequestOptions;
  getClientCapabilities?: () => Promise<Record<string, boolean | undefined>>;
  isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>;
  signalUnknownCredential?: (o: { rpId: string; credentialId: string }) => Promise<void>;
  signalAllAcceptedCredentials?: (o: {
    rpId: string;
    userId: string;
    allAcceptedCredentialIds: string[];
  }) => Promise<void>;
  signalCurrentUserDetails?: (o: {
    rpId: string;
    userId: string;
    name: string;
    displayName: string;
  }) => Promise<void>;
};

type JsonCredential = Credential & { toJSON?: () => unknown };

function statics(): PublicKeyCredentialStatics | null {
  const pkc = (globalThis as { PublicKeyCredential?: PublicKeyCredentialStatics })
    .PublicKeyCredential;
  if (
    !pkc ||
    typeof pkc.parseCreationOptionsFromJSON !== "function" ||
    typeof pkc.parseRequestOptionsFromJSON !== "function"
  ) {
    return null;
  }
  return pkc;
}

export type PasskeySupport = { ok: true } | { ok: false; reason: string };

// 画面表示時に呼び、未対応ならボタンを出さない
export async function passkeySupport(): Promise<PasskeySupport> {
  const pkc = statics();
  if (!pkc || !("credentials" in navigator)) {
    return { ok: false, reason: "このブラウザはパスキーに対応していません。" };
  }
  if (!window.isSecureContext) {
    return { ok: false, reason: "パスキーには HTTPS（または localhost）が必要です。" };
  }
  if (pkc.getClientCapabilities) {
    const caps = await pkc
      .getClientCapabilities()
      .catch((): Record<string, boolean | undefined> => ({}));
    if (caps["passkeyPlatformAuthenticator"] === false) {
      return { ok: false, reason: "この端末にはパスキーを保存できる機能がありません。" };
    }
  }
  return { ok: true };
}

export type WebAuthnFailure =
  | { kind: "cancelled" }
  | { kind: "duplicate" }
  | { kind: "config"; message: string }
  | { kind: "unsupported" }
  | { kind: "unknown"; message: string };

function mapError(e: unknown): WebAuthnFailure {
  const name = e instanceof Error ? e.name : "";
  switch (name) {
    case "NotAllowedError":
    case "AbortError":
      return { kind: "cancelled" };
    case "InvalidStateError":
      return { kind: "duplicate" };
    case "SecurityError":
      return { kind: "config", message: e instanceof Error ? e.message : "SecurityError" };
    case "NotSupportedError":
      return { kind: "unsupported" };
    default:
      return { kind: "unknown", message: e instanceof Error ? `${name}: ${e.message}` : String(e) };
  }
}

export function describeWebAuthnFailure(f: WebAuthnFailure): string {
  switch (f.kind) {
    case "cancelled":
      return "キャンセルされたか、時間切れです。もう一度ボタンを押してください。";
    case "duplicate":
      return "この端末にはもうこのアカウントのパスキーがあります。";
    case "config":
      return `設定の問題です（${f.message}）。サイトのホスト名と RP_ID が一致していません。`;
    case "unsupported":
      return "この端末ではパスキーを作れません。";
    case "unknown":
      return `パスキーの操作に失敗しました（${f.message}）`;
  }
}

// 登録（初回・招待・端末追加はすべて同じ ceremony）。ユーザー操作（クリック）から呼ぶこと
export async function createPasskey(
  options: PublicKeyCredentialCreationOptionsJSON,
): Promise<Result<RegistrationResponseJSON, WebAuthnFailure>> {
  const pkc = statics();
  if (!pkc?.parseCreationOptionsFromJSON) return err({ kind: "unsupported" });
  try {
    const publicKey = pkc.parseCreationOptionsFromJSON(options);
    const cred = (await navigator.credentials.create({ publicKey })) as JsonCredential | null;
    if (!cred?.toJSON) return err({ kind: "unsupported" });
    return ok(cred.toJSON() as RegistrationResponseJSON);
  } catch (e) {
    return err(mapError(e));
  }
}

// ログイン（discoverable credential: 端末がパスキー一覧を出す）
export async function getPasskey(
  options: PublicKeyCredentialRequestOptionsJSON,
): Promise<Result<AuthenticationResponseJSON, WebAuthnFailure>> {
  const pkc = statics();
  if (!pkc?.parseRequestOptionsFromJSON) return err({ kind: "unsupported" });
  try {
    const publicKey = pkc.parseRequestOptionsFromJSON(options);
    const cred = (await navigator.credentials.get({ publicKey })) as JsonCredential | null;
    if (!cred?.toJSON) return err({ kind: "unsupported" });
    return ok(cred.toJSON() as AuthenticationResponseJSON);
  } catch (e) {
    return err(mapError(e));
  }
}

// --- Signal API（パスワードマネージャ側の一覧をサーバーと同期。未対応なら何もしない） -------

export const rpId = (): string => location.hostname;

// WebAuthn の user handle = utf8(users.id) を base64url にしたもの（サーバーの utf8Bytes と同じ）
export function userHandle(userId: string): string {
  return btoa(userId).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function signalUnknownCredential(credentialId: string): Promise<void> {
  await statics()?.signalUnknownCredential?.({ rpId: rpId(), credentialId }).catch(() => {});
}

export async function signalAcceptedCredentials(userId: string, ids: string[]): Promise<void> {
  await statics()
    ?.signalAllAcceptedCredentials?.({
      rpId: rpId(),
      userId: userHandle(userId),
      allAcceptedCredentialIds: ids,
    })
    .catch(() => {});
}

export async function signalUserDetails(userId: string, displayName: string): Promise<void> {
  await statics()
    ?.signalCurrentUserDetails?.({
      rpId: rpId(),
      userId: userHandle(userId),
      name: displayName,
      displayName,
    })
    .catch(() => {});
}

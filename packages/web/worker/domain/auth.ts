import { z } from "zod";

export type UserId = string & { readonly __brand: unique symbol };
export const UserId = z.uuid().transform((v) => v as UserId);

// 表示名: 前後空白を落として 1〜32 文字、制御文字なし（絵文字や ZWJ 連結は可）
export type DisplayName = string & { readonly __brand: unique symbol };
export const DisplayName = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[^\p{Cc}]*$/u, "制御文字は使えません")
  .transform((v) => v as DisplayName);

// 端末ラベル。空文字は「なし」
const DeviceNameField = z
  .string()
  .trim()
  .max(64)
  .regex(/^[^\p{Cc}]*$/u, "制御文字は使えません")
  .nullish()
  .transform((v) => (v ? v : null));

// WebAuthn credential id は base64url。長さは authenticator 次第だが上限は設ける
export const CredentialId = z.string().regex(/^[A-Za-z0-9_-]{16,2048}$/);

// ブラウザの PublicKeyCredential.toJSON() の形。中身の検証は @simplewebauthn が行う
const RegistrationResponse = z
  .object({
    id: CredentialId,
    rawId: z.string(),
    type: z.literal("public-key"),
    response: z.object({ clientDataJSON: z.string(), attestationObject: z.string() }).loose(),
    clientExtensionResults: z.object({}).loose().default({}),
  })
  .loose();

const AuthenticationResponse = z
  .object({
    id: CredentialId,
    rawId: z.string(),
    type: z.literal("public-key"),
    response: z
      .object({ clientDataJSON: z.string(), authenticatorData: z.string(), signature: z.string() })
      .loose(),
    clientExtensionResults: z.object({}).loose().default({}),
  })
  .loose();

export const BeginRegistrationInput = z.object({
  displayName: DisplayName,
  initialRegistrationToken: z.string().min(1).max(256).optional(),
  inviteToken: z.string().min(1).max(256).optional(),
});

export const VerifyRegistrationInput = z.object({
  response: RegistrationResponse,
  deviceName: DeviceNameField,
});

export const VerifyLoginInput = z.object({ response: AuthenticationResponse });

export const AddCredentialBeginInput = z.object({ deviceName: DeviceNameField });

export const RenameCredentialInput = z.object({
  deviceName: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[^\p{Cc}]*$/u, "制御文字は使えません"),
});

export const UpdateMeInput = z.object({ displayName: DisplayName });

// 同期パスキーは counter が常に 0 なので、0 のときは退行チェックを免除する。
// @simplewebauthn/server 13.3.3 の verifyAuthenticationResponse も同じ規則を内蔵している
// （verified 2026-08-30 in matatabetai）。ここは判定の意味を固定するための純粋関数。
export function isCounterRegression(stored: number, received: number): boolean {
  return stored !== 0 && received <= stored;
}

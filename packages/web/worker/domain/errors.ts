import type { ContentfulStatusCode } from "hono/utils/http-status";
import { err, ok, type Result } from "neverthrow";
import type { z } from "zod";

// API が返す失敗はすべてこの union。レスポンスは { error: AppError } で、status は type から決まる。
export type AppError =
  | { type: "validation_error"; message: string }
  | { type: "registration_closed" }
  | { type: "challenge_mismatch"; message: string }
  | { type: "unauthorized"; message?: string }
  | { type: "session_expired" }
  | { type: "forbidden" }
  // 所属外のスペースも「存在しない」と同じ本文で返す（403 は存在が漏れる）
  | { type: "not_found"; message?: string }
  | { type: "last_credential" }
  | { type: "last_owner" }
  | { type: "already_owner" }
  | { type: "already_member" }
  | { type: "invite_invalid" }
  | { type: "invite_consumed" }
  | { type: "invite_expired" }
  | { type: "invite_race" }
  | { type: "photo_too_large"; maxBytes: number }
  // message には sniff 結果（image/heic 等）が入る。UI はこれで HEIC 向けの案内を出し分けない
  // （形式は問わず同じ文言）が、ログ・デバッグの手がかりに残す
  | { type: "photo_type_not_allowed"; message?: string };

const STATUS: Record<AppError["type"], ContentfulStatusCode> = {
  validation_error: 400,
  challenge_mismatch: 400,
  last_credential: 400,
  last_owner: 400,
  unauthorized: 401,
  session_expired: 401,
  registration_closed: 403,
  forbidden: 403,
  invite_invalid: 403,
  not_found: 404,
  already_owner: 409,
  already_member: 409,
  invite_race: 409,
  invite_consumed: 410,
  invite_expired: 410,
  photo_too_large: 413,
  photo_type_not_allowed: 415,
};

export function errorStatus(error: AppError): ContentfulStatusCode {
  return STATUS[error.type];
}

export function errorBody(error: AppError): { error: AppError } {
  return { error };
}

export function parseWith<S extends z.ZodType>(
  schema: S,
  input: unknown,
): Result<z.output<S>, AppError> {
  const r = schema.safeParse(input);
  if (r.success) return ok(r.data);
  const message = r.error.issues
    .map((i) => `${i.path.map(String).join(".") || "body"}: ${i.message}`)
    .join("; ");
  return err({ type: "validation_error", message });
}

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { and, count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono, type Context } from "hono";
import { credentials, users, type NewCredential, type NewUser } from "../db/schema";
import {
  AddCredentialBeginInput,
  BeginRegistrationInput,
  CredentialId,
  RenameCredentialInput,
  UpdateMeInput,
  UserId,
  VerifyLoginInput,
  VerifyRegistrationInput,
  isCounterRegression,
} from "../domain/auth";
import { errorBody, errorStatus, parseWith, type AppError } from "../domain/errors";
import type { AppEnv, Bindings } from "../env";
import { fromBase64Url, toBase64Url, utf8Bytes } from "../lib/base64url";
import { secretEquals } from "../lib/token";
import {
  consumeChallenge,
  issueChallenge,
  type ChallengeState,
} from "../middleware/challenge-cookie";
import { issueSession, revokeSession, sessionMiddleware } from "../middleware/session";
import { listMySpaces } from "../spaces/queries";
import { registerInitialUser, registerInvitedUser, validateInvite } from "../spaces/registration";

function fail(c: Context<AppEnv>, error: AppError) {
  return c.json(errorBody(error), errorStatus(error));
}

async function json(c: Context<AppEnv>): Promise<unknown> {
  return c.req.json().catch(() => undefined);
}

function parseTransports(raw: string | null): AuthenticatorTransportFuture[] | undefined {
  return raw ? (JSON.parse(raw) as AuthenticatorTransportFuture[]) : undefined;
}

function registrationOptions(
  env: Bindings,
  userId: string,
  displayName: string,
  exclude: { id: string; transports: string | null }[] = [],
) {
  return generateRegistrationOptions({
    rpName: env.RP_NAME,
    rpID: env.RP_ID,
    userID: utf8Bytes(userId),
    userName: displayName,
    userDisplayName: displayName,
    attestationType: "none",
    // 既に同じユーザのパスキーを持つ authenticator は InvalidStateError で重複を拒む
    excludeCredentials: exclude.map((e) => {
      const transports = parseTransports(e.transports);
      return transports ? { id: e.id, transports } : { id: e.id };
    }),
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
}

type Verified = Awaited<ReturnType<typeof verifyRegistrationResponse>>;

async function verifyRegistration(
  env: Bindings,
  response: RegistrationResponseJSON,
  challenge: string,
): Promise<Verified | AppError> {
  try {
    const v = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: env.ORIGIN, // ブラウザの origin とバイト単位で一致（ポート含む）
      expectedRPID: env.RP_ID,
      requireUserVerification: false,
    });
    if (!v.verified) return { type: "challenge_mismatch", message: "Registration not verified" };
    return v;
  } catch (e) {
    return { type: "challenge_mismatch", message: e instanceof Error ? e.message : "verification failed" };
  }
}

function credentialFrom(
  v: Extract<Verified, { verified: true }>,
  userId: string,
  deviceName: string | null,
  now: string,
): NewCredential {
  const { credential, credentialBackedUp } = v.registrationInfo;
  return {
    id: credential.id,
    userId,
    publicKey: toBase64Url(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ? JSON.stringify(credential.transports) : null,
    deviceName,
    backedUp: credentialBackedUp,
    createdAt: now,
    lastUsedAt: now,
  };
}

export const authRoutes = new Hono<AppEnv>()
  // ---------------------------------------------------------------- register (public)
  .post("/register/begin", async (c) => {
    const parsed = parseWith(BeginRegistrationInput, await json(c));
    if (parsed.isErr()) return fail(c, parsed.error);
    const { displayName, initialRegistrationToken, inviteToken } = parsed.value;
    // users.id はここで採番して challenge cookie に署名する。verify が同じ id で INSERT するので
    // verify の再送で 2 人できることはない
    const pendingUserId = crypto.randomUUID();

    let state: ChallengeState;
    if (inviteToken !== undefined) {
      const invite = await validateInvite(c.env.DB, inviteToken, new Date());
      if (invite.isErr()) return fail(c, invite.error);
      state = {
        kind: "invite",
        uid: pendingUserId,
        displayName,
        inviteId: invite.value.id,
        spaceId: invite.value.spaceId,
      };
    } else {
      // secret が未設定なら登録は閉じている（deploy 直後の空白時間も含めて）
      const secret = c.env.INITIAL_REGISTRATION_TOKEN;
      if (!secret || !initialRegistrationToken || !(await secretEquals(initialRegistrationToken, secret))) {
        return fail(c, { type: "registration_closed" });
      }
      state = { kind: "initial", uid: pendingUserId, displayName };
    }

    const options = await registrationOptions(c.env, pendingUserId, displayName);
    await issueChallenge(c, options.challenge, state);
    return c.json({ options });
  })
  .post("/register/verify", async (c) => {
    const parsed = parseWith(VerifyRegistrationInput, await json(c));
    if (parsed.isErr()) return fail(c, parsed.error);

    const ch = await consumeChallenge(c);
    if (!ch || (ch.state.kind !== "initial" && ch.state.kind !== "invite")) {
      return fail(c, { type: "challenge_mismatch", message: "No registration challenge" });
    }
    const v = await verifyRegistration(
      c.env,
      parsed.value.response as RegistrationResponseJSON,
      ch.challenge,
    );
    if (!("verified" in v)) return fail(c, v);
    if (!v.verified) return fail(c, { type: "challenge_mismatch", message: "Registration not verified" });

    const now = new Date().toISOString();
    const user: NewUser = { id: ch.state.uid, displayName: ch.state.displayName, createdAt: now };
    const cred = credentialFrom(v, user.id, parsed.value.deviceName, now);

    let spaceId: string;
    if (ch.state.kind === "initial") {
      spaceId = (await registerInitialUser(c.env.DB, user, cred)).spaceId;
    } else {
      const r = await registerInvitedUser(c.env.DB, ch.state, user, cred);
      if (r.isErr()) return fail(c, r.error);
      spaceId = r.value.spaceId;
    }

    await issueSession(c, UserId.parse(user.id));
    return c.json({ id: user.id, displayName: user.displayName, spaceId }, 201);
  })
  // ---------------------------------------------------------------- login (public)
  .post("/login/begin", async (c) => {
    // allowCredentials なし = discoverable credential（パスキー選択 UI）。ユーザ名欄は無い
    const options = await generateAuthenticationOptions({
      rpID: c.env.RP_ID,
      userVerification: "preferred",
    });
    await issueChallenge(c, options.challenge, { kind: "authentication" });
    return c.json({ options });
  })
  .post("/login/verify", async (c) => {
    const parsed = parseWith(VerifyLoginInput, await json(c));
    if (parsed.isErr()) return fail(c, parsed.error);
    const ch = await consumeChallenge(c);
    if (!ch || ch.state.kind !== "authentication") {
      return fail(c, { type: "challenge_mismatch", message: "No authentication challenge" });
    }

    const response = parsed.value.response as AuthenticationResponseJSON;
    const db = drizzle(c.env.DB);
    const rows = await db.select().from(credentials).where(eq(credentials.id, response.id));
    const row = rows[0];
    // 404 はクライアントが signalUnknownCredential を呼ぶ合図
    if (!row) return fail(c, { type: "not_found", message: "Credential not registered" });

    let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
    try {
      const transports = parseTransports(row.transports);
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: ch.challenge,
        expectedOrigin: c.env.ORIGIN,
        expectedRPID: c.env.RP_ID,
        credential: {
          id: row.id,
          publicKey: fromBase64Url(row.publicKey),
          counter: row.counter,
          ...(transports ? { transports } : {}),
        },
        requireUserVerification: false,
      });
    } catch (e) {
      return fail(c, {
        type: "challenge_mismatch",
        message: e instanceof Error ? e.message : "verification failed",
      });
    }
    if (!verification.verified) {
      return fail(c, { type: "challenge_mismatch", message: "Authentication not verified" });
    }
    const newCounter = verification.authenticationInfo.newCounter;
    if (isCounterRegression(row.counter, newCounter)) {
      return fail(c, { type: "unauthorized", message: "Authenticator counter regression" });
    }

    await db
      .update(credentials)
      .set({ counter: newCounter, lastUsedAt: new Date().toISOString() })
      .where(eq(credentials.id, row.id));

    const userId = UserId.parse(row.userId);
    await issueSession(c, userId);
    const u = (await db.select().from(users).where(eq(users.id, userId)))[0];
    if (!u) return fail(c, { type: "not_found", message: "User not found" });
    return c.json({ id: u.id, displayName: u.displayName });
  })
  // ---------------------------------------------------------------- session-only
  .post("/logout", sessionMiddleware(), async (c) => {
    await revokeSession(c);
    return c.json({});
  })
  .get("/me", sessionMiddleware(), async (c) => {
    const spaces = await listMySpaces(drizzle(c.env.DB), c.var.userId);
    return c.json({ id: c.var.userId, displayName: c.var.displayName, spaces });
  })
  .patch("/me", sessionMiddleware(), async (c) => {
    const parsed = parseWith(UpdateMeInput, await json(c));
    if (parsed.isErr()) return fail(c, parsed.error);
    await drizzle(c.env.DB)
      .update(users)
      .set({ displayName: parsed.value.displayName })
      .where(eq(users.id, c.var.userId));
    return c.json({ id: c.var.userId, displayName: parsed.value.displayName });
  })
  .get("/credentials", sessionMiddleware(), async (c) => {
    const rows = await drizzle(c.env.DB)
      .select({
        id: credentials.id,
        deviceName: credentials.deviceName,
        backedUp: credentials.backedUp,
        createdAt: credentials.createdAt,
        lastUsedAt: credentials.lastUsedAt,
      })
      .from(credentials)
      .where(eq(credentials.userId, c.var.userId))
      .orderBy(credentials.createdAt);
    return c.json(rows);
  })
  .post("/credentials/add/begin", sessionMiddleware(), async (c) => {
    const parsed = parseWith(AddCredentialBeginInput, await json(c) ?? {});
    if (parsed.isErr()) return fail(c, parsed.error);
    const userId = c.var.userId;
    const existing = await drizzle(c.env.DB)
      .select({ id: credentials.id, transports: credentials.transports })
      .from(credentials)
      .where(eq(credentials.userId, userId));
    const options = await registrationOptions(c.env, userId, c.var.displayName, existing);
    await issueChallenge(c, options.challenge, { kind: "add-credential", uid: userId });
    return c.json({ options });
  })
  .post("/credentials/add/verify", sessionMiddleware(), async (c) => {
    const parsed = parseWith(VerifyRegistrationInput, await json(c));
    if (parsed.isErr()) return fail(c, parsed.error);
    const ch = await consumeChallenge(c);
    if (!ch || ch.state.kind !== "add-credential" || ch.state.uid !== c.var.userId) {
      return fail(c, { type: "challenge_mismatch", message: "No add-credential challenge" });
    }
    const v = await verifyRegistration(
      c.env,
      parsed.value.response as RegistrationResponseJSON,
      ch.challenge,
    );
    if (!("verified" in v)) return fail(c, v);
    if (!v.verified) return fail(c, { type: "challenge_mismatch", message: "Registration not verified" });
    const now = new Date().toISOString();
    const cred = credentialFrom(v, c.var.userId, parsed.value.deviceName, now);
    await drizzle(c.env.DB)
      .insert(credentials)
      .values({ ...cred, lastUsedAt: null });
    return c.json({ id: cred.id }, 201);
  })
  .patch("/credentials/:id", sessionMiddleware(), async (c) => {
    const id = parseWith(CredentialId, c.req.param("id"));
    if (id.isErr()) return fail(c, id.error);
    const parsed = parseWith(RenameCredentialInput, await json(c));
    if (parsed.isErr()) return fail(c, parsed.error);
    const updated = await drizzle(c.env.DB)
      .update(credentials)
      .set({ deviceName: parsed.value.deviceName })
      .where(and(eq(credentials.id, id.value), eq(credentials.userId, c.var.userId)))
      .returning({ id: credentials.id });
    if (updated.length === 0) return fail(c, { type: "not_found", message: "Credential not found" });
    return c.json({ id: id.value, deviceName: parsed.value.deviceName });
  })
  .delete("/credentials/:id", sessionMiddleware(), async (c) => {
    const id = parseWith(CredentialId, c.req.param("id"));
    if (id.isErr()) return fail(c, id.error);
    const db = drizzle(c.env.DB);
    // 最後のパスキーを消すとアカウントは運用者なしに戻せない
    const [row] = await db
      .select({ n: count() })
      .from(credentials)
      .where(eq(credentials.userId, c.var.userId));
    if ((row?.n ?? 0) <= 1) return fail(c, { type: "last_credential" });
    const deleted = await db
      .delete(credentials)
      .where(and(eq(credentials.id, id.value), eq(credentials.userId, c.var.userId)))
      .returning({ id: credentials.id });
    if (deleted.length === 0) return fail(c, { type: "not_found", message: "Credential not found" });
    return c.json({});
  });

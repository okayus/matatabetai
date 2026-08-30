import { useState, type FormEvent } from "react";
import { describeFailure, registerBegin, registerVerify } from "../api";
import { useAuth } from "../auth";
import { Link } from "../components/Link";
import { navigate } from "../router";
import { createPasskey, describeWebAuthnFailure } from "../webauthn";
import { useSupport } from "./LoginPage";

// 初回 owner の登録。INITIAL_REGISTRATION_TOKEN を持つ人だけが通る
export function RegisterPage() {
  const { refresh } = useAuth();
  const support = useSupport();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const displayName = String(form.get("displayName") ?? "");
    const token = String(form.get("token") ?? "");
    const deviceName = String(form.get("deviceName") ?? "").trim() || null;
    setBusy(true);
    setError(null);
    const begin = await registerBegin({ displayName, initialRegistrationToken: token });
    if (begin.isErr()) {
      setError(describeFailure(begin.error));
      setBusy(false);
      return;
    }
    const cred = await createPasskey(begin.value.options);
    if (cred.isErr()) {
      setError(describeWebAuthnFailure(cred.error));
      setBusy(false);
      return;
    }
    const verify = await registerVerify(cred.value, deviceName);
    if (verify.isErr()) {
      setError(describeFailure(verify.error));
      setBusy(false);
      return;
    }
    await refresh();
    navigate("/", { replace: true });
  };

  return (
    <section className="stack">
      <h1>はじめる</h1>
      <p className="muted">
        登録トークンを持っている最初の一人が、ここで自分のスペースを作ります。家族はあとから招待リンクで参加できます。
      </p>
      {support && !support.ok && (
        <p role="alert" className="alert">
          {support.reason}
        </p>
      )}
      <form className="stack" onSubmit={(e) => void onSubmit(e)}>
        <div className="field">
          <label htmlFor="displayName">表示名</label>
          <input
            id="displayName"
            name="displayName"
            required
            maxLength={32}
            autoComplete="nickname"
            enterKeyHint="next"
          />
        </div>
        <div className="field">
          <label htmlFor="token">登録トークン</label>
          <span id="token-hint" className="hint">
            管理者から受け取った文字列
          </span>
          <input
            id="token"
            name="token"
            required
            autoComplete="one-time-code"
            aria-describedby="token-hint"
            enterKeyHint="next"
          />
        </div>
        <div className="field">
          <label htmlFor="deviceName">この端末の名前（任意）</label>
          <input id="deviceName" name="deviceName" maxLength={64} placeholder="例: iPhone" enterKeyHint="done" />
        </div>
        <button type="submit" className="btn btn--primary" disabled={busy || (support !== null && !support.ok)}>
          パスキーを作って登録
        </button>
        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}
      </form>
      <p className="muted">
        すでに登録済みなら<Link href="/login">ログイン</Link>へ。
      </p>
    </section>
  );
}

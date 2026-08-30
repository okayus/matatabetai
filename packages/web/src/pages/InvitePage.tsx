import { useEffect, useMemo, useState, type FormEvent } from "react";
import { acceptInvite, describeFailure, registerBegin, registerVerify } from "../api";
import { useAuth } from "../auth";
import { Link } from "../components/Link";
import { navigate } from "../router";
import { createPasskey, describeWebAuthnFailure } from "../webauthn";
import { usePasskeyLogin, useSupport } from "./LoginPage";

// 招待リンク /invite#token=… の着地点。トークンはフラグメントなのでサーバーには届かない。
// 未ログイン → 表示名を入れてパスキー登録（invite 経路）。ログイン済み → そのアカウントで参加。
export function InvitePage() {
  const { state, refresh } = useAuth();
  const token = useMemo(() => new URLSearchParams(location.hash.slice(1)).get("token"), []);

  useEffect(() => {
    // アドレスバーからトークンを消す（履歴やスクリーンショットに残さない）
    if (token) history.replaceState(null, "", "/invite");
  }, [token]);

  if (!token) {
    return (
      <section className="stack">
        <h1>招待リンクが正しくありません</h1>
        <p className="muted">リンク全体をコピーして開き直してください。</p>
      </section>
    );
  }
  if (state.status === "loading") return <p className="muted">読み込み中…</p>;
  if (state.status === "authed") {
    return <AcceptView token={token} displayName={state.me.displayName} onJoined={refresh} />;
  }
  return <RegisterViaInvite token={token} />;
}

function AcceptView({
  token,
  displayName,
  onJoined,
}: {
  token: string;
  displayName: string;
  onJoined: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const join = async () => {
    setBusy(true);
    setError(null);
    const r = await acceptInvite(token);
    if (r.isErr()) {
      setError(describeFailure(r.error));
      setBusy(false);
      return;
    }
    await onJoined();
    navigate("/", { replace: true });
  };
  return (
    <section className="stack">
      <h1>スペースに参加</h1>
      <p>
        <strong>{displayName}</strong> として、招待されたスペースに参加します。
      </p>
      <button type="button" className="btn btn--primary" onClick={() => void join()} disabled={busy}>
        参加する
      </button>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <p className="muted">
        <Link href="/">参加せずにホームへ</Link>
      </p>
    </section>
  );
}

function RegisterViaInvite({ token }: { token: string }) {
  const { refresh } = useAuth();
  const support = useSupport();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 既にアカウントがある人はここでログインすると、上の AcceptView に切り替わる
  const existing = usePasskeyLogin();

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const displayName = String(form.get("displayName") ?? "");
    const deviceName = String(form.get("deviceName") ?? "").trim() || null;
    setBusy(true);
    setError(null);
    const begin = await registerBegin({ displayName, inviteToken: token });
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
      <h1>招待されました</h1>
      <p className="muted">表示名を決めて、この端末にパスキーを作ると参加できます。</p>
      {support && !support.ok && (
        <p role="alert" className="alert">
          {support.reason}
        </p>
      )}
      <form className="stack" onSubmit={(e) => void onSubmit(e)}>
        <div className="field">
          <label htmlFor="displayName">表示名</label>
          <input id="displayName" name="displayName" required maxLength={32} autoComplete="nickname" enterKeyHint="next" />
        </div>
        <div className="field">
          <label htmlFor="deviceName">この端末の名前（任意）</label>
          <input id="deviceName" name="deviceName" maxLength={64} placeholder="例: iPhone" enterKeyHint="done" />
        </div>
        <button type="submit" className="btn btn--primary" disabled={busy || (support !== null && !support.ok)}>
          パスキーを作って参加
        </button>
        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}
      </form>
      <div className="card stack">
        <p className="muted">すでにアカウントがある方は、ログインしてから参加します。</p>
        <button type="button" className="btn" onClick={() => void existing.login()} disabled={existing.busy}>
          パスキーでログインして参加
        </button>
        {existing.error && (
          <p role="alert" className="alert">
            {existing.error}
          </p>
        )}
      </div>
    </section>
  );
}

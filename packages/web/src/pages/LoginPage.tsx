import { useEffect, useState } from "react";
import { describeFailure, loginBegin, loginVerify } from "../api";
import { useAuth } from "../auth";
import { Link } from "../components/Link";
import { navigate } from "../router";
import {
  describeWebAuthnFailure,
  getPasskey,
  passkeySupport,
  signalUnknownCredential,
  type PasskeySupport,
} from "../webauthn";

// パスキーでログインする 1 ボタン。onDone を渡すと（招待ページなど）遷移せずに呼び出し元へ戻す
export function usePasskeyLogin(onDone?: () => void) {
  const { refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const login = async () => {
    setBusy(true);
    setError(null);
    const begin = await loginBegin();
    if (begin.isErr()) {
      setError(describeFailure(begin.error));
      setBusy(false);
      return;
    }
    const cred = await getPasskey(begin.value.options);
    if (cred.isErr()) {
      setError(describeWebAuthnFailure(cred.error));
      setBusy(false);
      return;
    }
    const verify = await loginVerify(cred.value);
    if (verify.isErr()) {
      // サーバーが知らない credential: パスワードマネージャに削除を促す
      if (verify.error.kind === "http" && verify.error.status === 404) {
        void signalUnknownCredential(cred.value.id);
      }
      setError(describeFailure(verify.error));
      setBusy(false);
      return;
    }
    await refresh();
    setBusy(false);
    onDone?.();
  };
  return { login, error, busy };
}

export function useSupport(): PasskeySupport | null {
  const [support, setSupport] = useState<PasskeySupport | null>(null);
  useEffect(() => {
    void passkeySupport().then(setSupport);
  }, []);
  return support;
}

export function LoginPage() {
  const { state } = useAuth();
  const support = useSupport();
  const { login, error, busy } = usePasskeyLogin(() => navigate("/", { replace: true }));

  useEffect(() => {
    if (state.status === "authed") navigate("/", { replace: true });
  }, [state.status]);

  return (
    <section className="stack hero">
      <h1>またたべたい</h1>
      <p>家族で食べたものを記録して、「またたべたい」を次の献立に。</p>
      {support && !support.ok && (
        <p role="alert" className="alert">
          {support.reason}
        </p>
      )}
      <button
        type="button"
        className="btn btn--primary"
        onClick={() => void login()}
        disabled={busy || (support !== null && !support.ok)}
      >
        パスキーでログイン
      </button>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <p className="muted">
        はじめての方は<Link href="/register">登録トークンで登録</Link>
        。家族に招待された方は、届いた招待リンクを開いてください。
      </p>
    </section>
  );
}

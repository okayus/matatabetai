import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  addCredentialBegin,
  addCredentialVerify,
  createSpace,
  deleteCredential,
  describeFailure,
  listCredentials,
  logout,
  renameCredential,
  updateMe,
  type Credential,
  type Me,
  type SpaceSummary,
} from "../api";
import { useAuth } from "../auth";
import { Link } from "../components/Link";
import { formatDateTime } from "../format";
import { navigate } from "../router";
import {
  createPasskey,
  describeWebAuthnFailure,
  signalAcceptedCredentials,
  signalUserDetails,
} from "../webauthn";

// 自分のこと: 表示名・パスキー・所属しているスペース。スペース一覧と「自分のスペースを作る」は
// 所属の管理なので、記録を眺めるホームではなくここに置く（ADR-009 §5）
export function AccountPage({ me }: { me: Me }) {
  const { refresh, clear } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const ownsSpace = me.spaces.some((s) => s.role === "owner");

  const onLogout = async () => {
    await logout();
    clear();
    navigate("/login", { replace: true });
  };

  const onRename = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const displayName = String(new FormData(e.currentTarget).get("displayName") ?? "");
    setError(null);
    const r = await updateMe(displayName);
    if (r.isErr()) {
      setError(describeFailure(r.error));
      return;
    }
    void signalUserDetails(me.id, r.value.displayName);
    await refresh();
  };

  return (
    <section className="stack">
      <h1>アカウント</h1>
      <form className="card stack" onSubmit={(e) => void onRename(e)}>
        <h2>表示名</h2>
        <div className="field">
          <label htmlFor="displayName">表示名</label>
          <input id="displayName" name="displayName" required maxLength={32} defaultValue={me.displayName} autoComplete="nickname" />
        </div>
        <button type="submit" className="btn">
          保存
        </button>
        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}
      </form>
      <PasskeysSection me={me} />
      <SpacesSection spaces={me.spaces} />
      {!ownsSpace && <CreateSpaceForm />}
      <div className="card stack">
        <button type="button" className="btn btn--danger" onClick={() => void onLogout()}>
          ログアウト
        </button>
      </div>
    </section>
  );
}

function SpacesSection({ spaces }: { spaces: SpaceSummary[] }) {
  if (spaces.length === 0) return null;
  return (
    <div className="card stack">
      <h2>スペース</h2>
      <ul className="list" role="list">
        {spaces.map((s) => (
          <li key={s.id} className="list-item">
            <div className="stack stack--tight">
              <strong>{s.name}</strong>
              <span className="muted">
                <span className="badge">{s.role === "owner" ? "オーナー" : "メンバー"}</span> {s.memberCount} 人
              </span>
            </div>
            <Link href={`/spaces/${s.id}/settings`} className="btn btn--ghost">
              設定
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CreateSpaceForm() {
  const { refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name") ?? "");
    setBusy(true);
    setError(null);
    const r = await createSpace(name);
    if (r.isErr()) {
      setError(describeFailure(r.error));
      setBusy(false);
      return;
    }
    await refresh();
    setBusy(false);
  };
  return (
    <form className="card stack" onSubmit={(e) => void onSubmit(e)}>
      <h2>自分のスペースを作る</h2>
      <p className="muted">作れるのは 1 つだけです。家族を招待して一緒に記録できます。</p>
      <div className="field">
        <label htmlFor="spaceName">スペースの名前</label>
        <input id="spaceName" name="name" required maxLength={40} placeholder="例: わが家の食卓" />
      </div>
      <button type="submit" className="btn btn--primary" disabled={busy}>
        作る
      </button>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function PasskeysSection({ me }: { me: Me }) {
  const [items, setItems] = useState<Credential[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await listCredentials();
    if (r.isErr()) {
      setError(describeFailure(r.error));
      return;
    }
    setItems(r.value);
    // パスワードマネージャ側の一覧をサーバーに合わせる（対応ブラウザだけ）
    void signalAcceptedCredentials(
      me.id,
      r.value.map((c) => c.id),
    );
  }, [me.id]);
  useEffect(() => {
    void load();
  }, [load]);

  const add = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const deviceName = String(new FormData(form).get("deviceName") ?? "").trim() || null;
    setBusy(true);
    setError(null);
    const begin = await addCredentialBegin(deviceName);
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
    const verify = await addCredentialVerify(cred.value, deviceName);
    if (verify.isErr()) {
      setError(describeFailure(verify.error));
      setBusy(false);
      return;
    }
    form.reset();
    setBusy(false);
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm("このパスキーを削除しますか？")) return;
    setError(null);
    const r = await deleteCredential(id);
    if (r.isErr()) {
      setError(describeFailure(r.error));
      return;
    }
    await load();
  };

  const rename = async (id: string, e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const deviceName = String(new FormData(e.currentTarget).get("deviceName") ?? "");
    setError(null);
    const r = await renameCredential(id, deviceName);
    if (r.isErr()) {
      setError(describeFailure(r.error));
      return;
    }
    setEditing(null);
    await load();
  };

  return (
    <div className="card stack">
      <h2>パスキー</h2>
      <p className="muted">
        端末をなくしても入れるように、2 つ以上の端末（または同期されるパスキー）を登録しておくのがおすすめです。
      </p>
      <ul className="list">
        {items.map((c) => (
          <li key={c.id} className="list-item">
            {editing === c.id ? (
              <form className="row" onSubmit={(e) => void rename(c.id, e)}>
                <label htmlFor={`name-${c.id}`} className="visually-hidden">
                  端末の名前
                </label>
                <input id={`name-${c.id}`} name="deviceName" required maxLength={64} defaultValue={c.deviceName ?? ""} />
                <button type="submit" className="btn btn--small">
                  保存
                </button>
                <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditing(null)}>
                  やめる
                </button>
              </form>
            ) : (
              <>
                <div className="stack stack--tight">
                  <strong>{c.deviceName ?? "名前のないパスキー"}</strong>
                  <span className="muted">
                    <span className="badge">{c.backedUp ? "同期あり" : "この端末だけ"}</span>{" "}
                    登録 {formatDateTime(c.createdAt)}
                    {c.lastUsedAt && ` ・ 最終使用 ${formatDateTime(c.lastUsedAt)}`}
                  </span>
                </div>
                <div className="row">
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditing(c.id)}>
                    名前
                  </button>
                  <button
                    type="button"
                    className="btn btn--danger btn--small"
                    onClick={() => void remove(c.id)}
                    disabled={items.length <= 1}
                  >
                    削除
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      <form className="stack" onSubmit={(e) => void add(e)}>
        <h3>この端末にパスキーを追加</h3>
        <div className="field">
          <label htmlFor="newDeviceName">端末の名前（任意）</label>
          <input id="newDeviceName" name="deviceName" maxLength={64} placeholder="例: iPad" />
        </div>
        <button type="submit" className="btn" disabled={busy}>
          パスキーを追加
        </button>
      </form>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
    </div>
  );
}

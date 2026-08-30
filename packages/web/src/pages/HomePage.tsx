import { useState, type FormEvent } from "react";
import { createSpace, describeFailure, type Me } from "../api";
import { useAuth } from "../auth";
import { Link } from "../components/Link";

export function HomePage({ me }: { me: Me }) {
  const ownsSpace = me.spaces.some((s) => s.role === "owner");
  return (
    <section className="stack">
      <h1>こんにちは、{me.displayName} さん</h1>
      {me.spaces.length === 0 ? (
        <p className="muted">まだどのスペースにも入っていません。</p>
      ) : (
        <ul className="list">
          {me.spaces.map((s) => (
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
      )}
      <div className="card stack">
        <h2>食べたものの記録</h2>
        <p className="muted">ここに食べたものが並びます。記録機能は次のフェーズで入ります。</p>
      </div>
      {!ownsSpace && <CreateSpaceForm />}
    </section>
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

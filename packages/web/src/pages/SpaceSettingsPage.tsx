import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  describeFailure,
  getSpace,
  issueInvite,
  listInvites,
  removeMember,
  renameSpace,
  revokeInvite,
  type ApiFailure,
  type IssuedInvite,
  type Me,
  type PendingInvite,
  type SpaceDetail,
} from "../api";
import { useAuth } from "../auth";
import { Link } from "../components/Link";
import { formatDate, formatDateTime } from "../format";
import { navigate } from "../router";

export function SpaceSettingsPage({ me, spaceId }: { me: Me; spaceId: string }) {
  const [space, setSpace] = useState<SpaceDetail | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  const load = useCallback(async () => {
    const r = await getSpace(spaceId);
    if (r.isOk()) setSpace(r.value);
    else setFailure(r.error);
  }, [spaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (failure) {
    // 所属外は 404 で返る（存在も教えない）。UI も同じ一文にする
    return (
      <section className="stack">
        <h1>スペースが見つかりません</h1>
        <p role="alert" className="alert">
          アクセス権がありません。または存在しないスペースです。
        </p>
        <p>
          <Link href="/">ホームへ戻る</Link>
        </p>
      </section>
    );
  }
  if (!space) return <p className="muted">読み込み中…</p>;

  const isOwner = space.role === "owner";
  return (
    <section className="stack">
      <h1>{space.name}</h1>
      <p className="muted">
        {formatDate(space.createdAt)} に作成 ・ あなたは{isOwner ? "オーナー" : "メンバー"}
      </p>
      {isOwner && <RenameForm space={space} onSaved={load} />}
      <MembersSection space={space} me={me} onChanged={load} />
      {isOwner && <InvitesSection spaceId={space.id} />}
    </section>
  );
}

function RenameForm({ space, onSaved }: { space: SpaceDetail; onSaved: () => Promise<void> }) {
  const { refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name") ?? "");
    setError(null);
    const r = await renameSpace(space.id, name);
    if (r.isErr()) {
      setError(describeFailure(r.error));
      return;
    }
    await Promise.all([onSaved(), refresh()]);
  };
  return (
    <form className="card stack" onSubmit={(e) => void onSubmit(e)}>
      <h2>スペースの名前</h2>
      <div className="field">
        <label htmlFor="name">名前</label>
        <input id="name" name="name" required maxLength={40} defaultValue={space.name} />
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
  );
}

function MembersSection({
  space,
  me,
  onChanged,
}: {
  space: SpaceDetail;
  me: Me;
  onChanged: () => Promise<void>;
}) {
  const { refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const isOwner = space.role === "owner";
  const remove = async (userId: string) => {
    const self = userId === me.id;
    if (!confirm(self ? "このスペースを抜けますか？" : "このメンバーを外しますか？")) return;
    setError(null);
    const r = await removeMember(space.id, userId);
    if (r.isErr()) {
      setError(describeFailure(r.error));
      return;
    }
    if (self) {
      await refresh();
      navigate("/", { replace: true });
      return;
    }
    await onChanged();
  };
  return (
    <div className="card stack">
      <h2>メンバー</h2>
      <ul className="list">
        {space.members.map((m) => (
          <li key={m.userId} className="list-item">
            <div className="stack stack--tight">
              <strong>
                {m.displayName}
                {m.userId === me.id && <span className="muted">（あなた）</span>}
              </strong>
              <span className="muted">
                <span className="badge">{m.role === "owner" ? "オーナー" : "メンバー"}</span>{" "}
                {formatDate(m.joinedAt)} に参加
              </span>
            </div>
            {(isOwner || m.userId === me.id) && (
              <button type="button" className="btn btn--danger btn--small" onClick={() => void remove(m.userId)}>
                {m.userId === me.id ? "抜ける" : "外す"}
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function InvitesSection({ spaceId }: { spaceId: string }) {
  const [pending, setPending] = useState<PendingInvite[]>([]);
  const [issued, setIssued] = useState<IssuedInvite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator.share === "function";

  const load = useCallback(async () => {
    const r = await listInvites(spaceId);
    if (r.isOk()) setPending(r.value);
    else setError(describeFailure(r.error));
  }, [spaceId]);
  useEffect(() => {
    void load();
  }, [load]);

  const issue = async () => {
    setError(null);
    setCopied(false);
    const r = await issueInvite(spaceId);
    if (r.isErr()) {
      setError(describeFailure(r.error));
      return;
    }
    setIssued(r.value);
    await load();
  };
  const revoke = async (inviteId: string) => {
    setError(null);
    const r = await revokeInvite(spaceId, inviteId);
    if (r.isErr()) {
      setError(describeFailure(r.error));
      return;
    }
    if (issued?.inviteId === inviteId) setIssued(null);
    await load();
  };
  const copy = async () => {
    if (!issued) return;
    await navigator.clipboard.writeText(issued.url).then(
      () => setCopied(true),
      () => setError("コピーできませんでした。リンクを長押しして選択してください。"),
    );
  };
  const share = async () => {
    if (!issued) return;
    await navigator.share({ title: "またたべたい への招待", url: issued.url }).catch(() => {});
  };

  return (
    <div className="card stack">
      <h2>招待</h2>
      <p className="muted">招待リンクは 7 日間・1 回だけ使えます。LINE などで家族に送ってください。</p>
      <button type="button" className="btn btn--primary" onClick={() => void issue()}>
        招待リンクを作る
      </button>
      {issued && (
        <div className="stack stack--tight">
          <label htmlFor="invite-url">招待リンク（このあとは表示されません）</label>
          <input id="invite-url" readOnly value={issued.url} onFocus={(e) => e.currentTarget.select()} />
          <div className="row">
            <button type="button" className="btn" onClick={() => void copy()}>
              {copied ? "コピーしました" : "コピー"}
            </button>
            {canShare && (
              <button type="button" className="btn" onClick={() => void share()}>
                共有
              </button>
            )}
          </div>
          <span className="muted">有効期限: {formatDateTime(issued.expiresAt)}</span>
        </div>
      )}
      {pending.length > 0 && (
        <>
          <h3>未使用の招待</h3>
          <ul className="list">
            {pending.map((i) => (
              <li key={i.id} className="list-item">
                <span className="muted">{formatDateTime(i.expiresAt)} まで有効</span>
                <button type="button" className="btn btn--danger btn--small" onClick={() => void revoke(i.id)}>
                  取り消す
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
    </div>
  );
}

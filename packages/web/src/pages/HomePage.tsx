import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import {
  createMeal,
  createSpace,
  describeFailure,
  listMeals,
  listMealSuggestions,
  listSpaceTags,
  mealPhotoUrl,
  uploadMealPhoto,
  type Me,
  type Meal,
  type MealPhoto,
  type MealSuggestion,
  type MealTag,
  type SpaceSummary,
} from "../api";
import { useAuth } from "../auth";
import { Link } from "../components/Link";
import { MealFields } from "../components/MealFields";
import { MealList } from "../components/MealList";
import { TagFilter } from "../components/TagFilter";
import { formatEatenOn, formatShortDate, todayLocalDate } from "../format";
import { preparePhoto, type PreparedPhoto } from "../lib/image-prep";
import { applySuggestion, emptyMealForm, toMealContentBody, type MealFormState } from "../lib/meal-form";
import { sortByRecency } from "../lib/meal-order";
import { primarySpace } from "../lib/space";

export function HomePage({ me }: { me: Me }) {
  const ownsSpace = me.spaces.some((s) => s.role === "owner");
  const primary = primarySpace(me.spaces);
  return (
    <section className="stack">
      <h1>こんにちは、{me.displayName} さん</h1>
      {primary ? (
        <MealsSection key={primary.id} space={primary} />
      ) : (
        <p className="muted">まだどのスペースにも入っていません。</p>
      )}
      <SpacesSection spaces={me.spaces} />
      {!ownsSpace && <CreateSpaceForm />}
    </section>
  );
}

function MealsSection({ space }: { space: SpaceSummary }) {
  const [meals, setMeals] = useState<Meal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 記録が変わればサジェストも変わる（消した料理の札や、消えた写真を出したままにしない）
  const [mealsVersion, setMealsVersion] = useState(0);
  const bumpVersion = () => setMealsVersion((n) => n + 1);

  const load = useCallback(async () => {
    const r = await listMeals(space.id);
    if (r.isOk()) setMeals(r.value);
    else setError(describeFailure(r.error));
  }, [space.id]);
  useEffect(() => {
    void load();
  }, [load]);

  // eaten_on DESC, created_at DESC のサーバー順を、手元の挿入でも保つ
  const insert = (m: Meal) => {
    setMeals((prev) => sortByRecency([m, ...(prev ?? [])]));
    bumpVersion();
  };

  return (
    <>
      <MealForm spaceId={space.id} suggestionKey={mealsVersion} onCreated={insert} />
      <section className="card stack" aria-labelledby="feedHeading">
        <h2 id="feedHeading">みんなの記録</h2>
        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}
        {meals === null ? (
          <p className="muted">読み込み中…</p>
        ) : meals.length === 0 ? (
          <p className="muted">まだ記録がありません。最初のたべたものを記録してみましょう。</p>
        ) : (
          <MealList
            spaceId={space.id}
            meals={meals}
            onMealsChange={(update) => setMeals((prev) => update(prev ?? []))}
            onRecordsChanged={bumpVersion}
            onError={setError}
          />
        )}
      </section>
    </>
  );
}

// 選択済みでまだ送っていない写真。preview はサムネ blob の object URL（外したら revoke）
type PendingPhoto = { key: string; prepared: PreparedPhoto; previewUrl: string };

function MealForm({
  spaceId,
  suggestionKey,
  onCreated,
}: {
  spaceId: string;
  suggestionKey: number;
  onCreated: (m: Meal) => void;
}) {
  const [form, setForm] = useState<MealFormState>(() => emptyMealForm(todayLocalDate()));
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 引き継いだことの知らせ（読み上げは role="status"）
  const [carriedOver, setCarriedOver] = useState<string | null>(null);

  const set = <K extends keyof MealFormState>(key: K, value: MealFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const onPickPhotos = async (e: ChangeEvent<HTMLInputElement>) => {
    // currentTarget は await の後で使えない。FileList も value 消去で空になるので先に配列へ
    const files = Array.from(e.currentTarget.files ?? []);
    e.currentTarget.value = "";
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    let unreadable = false;
    for (const file of files) {
      const prepared = await preparePhoto(file);
      if (!prepared) {
        unreadable = true;
        continue;
      }
      setPending((prev) => [
        ...prev,
        {
          key: crypto.randomUUID(),
          prepared,
          previewUrl: URL.createObjectURL(prepared.thumb.blob),
        },
      ]);
    }
    if (unreadable) {
      setError(
        "読み込めない写真がありました（HEIC の可能性）。iPhone は 設定 → カメラ → フォーマット → 互換性優先 にするか、JPEG で共有してください。",
      );
    }
    setBusy(false);
  };
  const removePending = (key: string) => {
    setPending((prev) => {
      const target = prev.find((p) => p.key === key);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.key !== key);
    });
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await createMeal(spaceId, toMealContentBody(form));
    if (r.isErr()) {
      setBusy(false);
      setError(describeFailure(r.error));
      return;
    }
    // meal は出来ているので、写真が一部失敗しても投稿は一覧に出す（失敗分だけ知らせる）
    const photos: MealPhoto[] = [];
    let photoFailure: string | null = null;
    for (const p of pending) {
      const up = await uploadMealPhoto(spaceId, r.value.id, p.prepared);
      if (up.isOk()) photos.push(up.value);
      else photoFailure = describeFailure(up.error);
    }
    setBusy(false);
    onCreated({ ...r.value, photos });
    for (const p of pending) URL.revokeObjectURL(p.previewUrl);
    setPending([]);
    if (photoFailure) {
      setError(`記録は保存しましたが、写真を送れませんでした: ${photoFailure}`);
    }
    setForm(emptyMealForm(todayLocalDate()));
    setCarriedOver(null);
  };

  return (
    <form className="card stack" aria-labelledby="mealFormHeading" onSubmit={(e) => void onSubmit(e)}>
      <h2 id="mealFormHeading">たべたものを記録</h2>
      <MealFields
        idPrefix="newMeal"
        form={form}
        onChange={set}
        afterName={
          <>
            <SuggestionPicker
              spaceId={spaceId}
              reloadKey={suggestionKey}
              onPick={(s) => {
                setForm((f) => applySuggestion(f, s));
                setCarriedOver(s.name);
              }}
            />
            {/* 空でも要素を残す（後から現れる live region は読み上げられないことがある） */}
            <p className="hint status-line" role="status">
              {carriedOver && `「${carriedOver}」の前回の内容を引き継ぎました。日付とひとことメモは今回の分をどうぞ。`}
            </p>
          </>
        }
        photos={
          <>
            <div className="field">
              <label htmlFor="newMealPhotos">写真</label>
              <span id="newMealPhotosHint" className="hint">
                複数選べます。この端末で縮小してから送ります（位置情報は残りません）
              </span>
              <input
                id="newMealPhotos"
                type="file"
                accept="image/*"
                multiple
                aria-describedby="newMealPhotosHint"
                disabled={busy}
                onChange={(e) => void onPickPhotos(e)}
              />
            </div>
            {pending.length > 0 && (
              <ul className="photo-strip" role="list">
                {pending.map((p, i) => (
                  <li key={p.key} className="photo-pending">
                    <img src={p.previewUrl} alt={`選択中の写真 ${i + 1}`} />
                    <button
                      type="button"
                      className="btn btn--small"
                      disabled={busy}
                      onClick={() => removePending(p.key)}
                    >
                      外す<span className="visually-hidden">（選択中の写真 {i + 1}）</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        }
      />
      <button type="submit" className="btn btn--primary" disabled={busy}>
        記録する
      </button>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
    </form>
  );
}

// 投稿フォームのサジェスト（requirements 8）。料理名ごとの直近 1 件を新しい順に並べ、
// 選ぶと前回のリンク 2 種 / 作り方メモ / タグをフォームに複製する（編集してから新規投稿 — ADR-003 §5）
function SuggestionPicker({
  spaceId,
  reloadKey,
  onPick,
}: {
  spaceId: string;
  reloadKey: number;
  onPick: (s: MealSuggestion) => void;
}) {
  const [suggestions, setSuggestions] = useState<MealSuggestion[] | null>(null);
  const [tagList, setTagList] = useState<MealTag[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void listSpaceTags(spaceId).then((r) => {
      if (live && r.isOk()) setTagList(r.value);
    });
    return () => {
      live = false;
    };
  }, [spaceId, reloadKey]);

  // 絞り込みを続けて切り替えたときに、古い応答で上書きしない
  useEffect(() => {
    let live = true;
    void listMealSuggestions(spaceId, selected).then((r) => {
      if (!live) return;
      setFailed(r.isErr());
      if (r.isOk()) setSuggestions(r.value);
    });
    return () => {
      live = false;
    };
  }, [spaceId, selected, reloadKey]);

  const toggleTag = (name: string) =>
    setSelected((prev) => (prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]));

  if (failed) return <p className="hint">最近のたべたものを読み込めませんでした。</p>;
  // 記録がまだ無いスペースでは出さない（絞り込み中は 0 件でも枠を残す — 解除できなくなるので）
  if (suggestions === null || (suggestions.length === 0 && selected.length === 0)) return null;

  return (
    <div className="field">
      <h3>最近のたべたもの</h3>
      <span className="hint">タップすると前回のリンク・作り方メモ・タグを引き継ぎます</span>
      <TagFilter tagList={tagList} selected={selected} onToggle={toggleTag} />
      {suggestions.length === 0 ? (
        <p className="hint">このタグの記録はまだありません。</p>
      ) : (
        <ul className="suggest-strip" role="list">
          {suggestions.map((s) => (
            <li key={s.mealId}>
              <button type="button" className="suggest-card" onClick={() => onPick(s)}>
                {s.photo ? (
                  <img
                    className="suggest-card__media"
                    src={mealPhotoUrl(spaceId, s.mealId, s.photo.id, s.photo.hasThumb ? "thumb" : undefined)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span className="suggest-card__media suggest-card__media--blank" aria-hidden="true">
                    🍚
                  </span>
                )}
                <span className="suggest-card__name">{s.name}</span>
                <span className="suggest-card__meta" aria-hidden="true">
                  {s.mataTabetai && <span className="suggest-card__mata">♥</span>}
                  {formatShortDate(s.lastEatenOn)}
                </span>
                <span className="visually-hidden">
                  {`${s.mataTabetai ? "またたべたい。" : ""}前回 ${formatEatenOn(s.lastEatenOn)}。前回の内容を引き継ぐ`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
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

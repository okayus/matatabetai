import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  createMeal,
  createSpace,
  deleteMeal,
  deleteMealPhoto,
  describeFailure,
  listMeals,
  mealPhotoUrl,
  setMataTabetai,
  uploadMealPhoto,
  type CreateMealBody,
  type Me,
  type Meal,
  type MealPhoto,
  type MealType,
  type RecipeSource,
  type SpaceSummary,
} from "../api";
import { useAuth } from "../auth";
import { Link } from "../components/Link";
import { formatEatenOn, todayLocalDate } from "../format";
import { preparePhoto, type PreparedPhoto } from "../lib/image-prep";

const MEAL_TYPE_LABEL: Record<MealType, string> = {
  breakfast: "朝",
  lunch: "昼",
  dinner: "夜",
  snack: "間食",
};

export function HomePage({ me }: { me: Me }) {
  const ownsSpace = me.spaces.some((s) => s.role === "owner");
  // スペース切替 UI は当面持たない（requirements.md backlog）。自分のスペース優先で 1 つに決める
  const primary = me.spaces.find((s) => s.role === "owner") ?? me.spaces[0];
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
  const [lightbox, setLightbox] = useState<{ meal: Meal; photo: MealPhoto } | null>(null);

  const load = useCallback(async () => {
    const r = await listMeals(space.id);
    if (r.isOk()) setMeals(r.value);
    else setError(describeFailure(r.error));
  }, [space.id]);
  useEffect(() => {
    void load();
  }, [load]);

  // eaten_on DESC, created_at DESC のサーバー順を、手元の挿入でも保つ
  const insert = (m: Meal) =>
    setMeals((prev) =>
      [m, ...(prev ?? [])].sort(
        (a, b) => b.eatenOn.localeCompare(a.eatenOn) || b.createdAt.localeCompare(a.createdAt),
      ),
    );
  const toggle = async (m: Meal) => {
    setError(null);
    const r = await setMataTabetai(space.id, m.id, !m.mataTabetai);
    if (r.isErr()) {
      setError(describeFailure(r.error));
      return;
    }
    setMeals((prev) =>
      (prev ?? []).map((x) =>
        x.id === m.id ? { ...x, mataTabetai: r.value.mataTabetai, updatedAt: r.value.updatedAt } : x,
      ),
    );
  };
  const remove = async (m: Meal) => {
    if (!confirm(`「${m.name}」を削除しますか？`)) return;
    setError(null);
    const r = await deleteMeal(space.id, m.id);
    if (r.isErr()) {
      setError(describeFailure(r.error));
      return;
    }
    setMeals((prev) => (prev ?? []).filter((x) => x.id !== m.id));
  };
  const removePhoto = async (sel: { meal: Meal; photo: MealPhoto }) => {
    if (!confirm("この写真を削除しますか？")) return;
    setError(null);
    const r = await deleteMealPhoto(space.id, sel.meal.id, sel.photo.id);
    if (r.isErr()) {
      setError(describeFailure(r.error));
      return;
    }
    setMeals((prev) =>
      (prev ?? []).map((x) =>
        x.id === sel.meal.id
          ? { ...x, photos: x.photos.filter((p) => p.id !== sel.photo.id) }
          : x,
      ),
    );
    setLightbox(null);
  };

  return (
    <>
      <MealForm spaceId={space.id} onCreated={insert} />
      <div className="card stack">
        <h2>みんなの記録</h2>
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
          groupByEatenOn(meals).map(([date, items]) => (
            <div key={date} className="stack stack--tight">
              <h3 className="muted">{formatEatenOn(date)}</h3>
              {/* list-style を消した ul は Safari が list 扱いしなくなるので role を戻す */}
              <ul className="list" role="list">
                {items.map((m) => (
                  <MealItem
                    key={m.id}
                    spaceId={space.id}
                    meal={m}
                    onToggle={toggle}
                    onRemove={remove}
                    onOpenPhoto={(meal, photo) => setLightbox({ meal, photo })}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
      <PhotoLightbox
        spaceId={space.id}
        selected={lightbox}
        onClose={() => setLightbox(null)}
        onDelete={removePhoto}
      />
    </>
  );
}

// 拡大表示。<dialog> の showModal で開く（Esc は native、背景タップは e.target === dialog で判定）
function PhotoLightbox({
  spaceId,
  selected,
  onClose,
  onDelete,
}: {
  spaceId: string;
  selected: { meal: Meal; photo: MealPhoto } | null;
  onClose: () => void;
  onDelete: (sel: { meal: Meal; photo: MealPhoto }) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (selected && !dialog.open) dialog.showModal();
    if (!selected && dialog.open) dialog.close();
  }, [selected]);
  return (
    <dialog
      ref={ref}
      className="lightbox"
      aria-label={selected ? `${selected.meal.name} の写真` : "写真の拡大表示"}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {selected && (
        <div className="stack stack--tight">
          <img
            src={mealPhotoUrl(spaceId, selected.meal.id, selected.photo.id)}
            alt={`${selected.meal.name} の写真`}
            width={selected.photo.width}
            height={selected.photo.height}
          />
          <div className="row row--between">
            <button
              type="button"
              className="btn btn--danger btn--small"
              onClick={() => onDelete(selected)}
            >
              写真を削除
            </button>
            <button type="button" className="btn btn--small" onClick={onClose}>
              閉じる
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

// meals は eaten_on DESC で並んでいるので、連続する同じ日をまとめるだけでよい
function groupByEatenOn(meals: Meal[]): [string, Meal[]][] {
  const groups: [string, Meal[]][] = [];
  for (const m of meals) {
    const last = groups[groups.length - 1];
    if (last && last[0] === m.eatenOn) last[1].push(m);
    else groups.push([m.eatenOn, [m]]);
  }
  return groups;
}

// 選択済みでまだ送っていない写真。preview はサムネ blob の object URL（外したら revoke）
type PendingPhoto = { key: string; prepared: PreparedPhoto; previewUrl: string };

function MealForm({ spaceId, onCreated }: { spaceId: string; onCreated: (m: Meal) => void }) {
  const [sourceKind, setSourceKind] = useState<RecipeSource["type"]>("none");
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    const form = e.currentTarget;
    const data = new FormData(form);
    const text = (name: string) => String(data.get(name) ?? "").trim();
    const recipeSource: RecipeSource =
      sourceKind === "url"
        ? { type: "url", url: text("url") }
        : sourceKind === "text"
          ? { type: "text", text: text("recipeText") }
          : { type: "none" };
    const body: CreateMealBody = {
      name: text("name"),
      eatenOn: text("eatenOn"),
      mealType: (text("mealType") || null) as MealType | null,
      recipeSource,
      note: text("note") || null,
      tags: text("tags")
        .split(/[、,\s]+/u)
        .filter(Boolean),
    };
    setBusy(true);
    setError(null);
    const r = await createMeal(spaceId, body);
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
    form.reset();
    setSourceKind("none");
  };

  return (
    <form className="card stack" onSubmit={(e) => void onSubmit(e)}>
      <h2>たべたものを記録</h2>
      <div className="field">
        <label htmlFor="mealName">料理名</label>
        <input id="mealName" name="name" required maxLength={100} placeholder="例: 肉じゃが" />
      </div>
      <div className="row">
        <div className="field field--grow">
          <label htmlFor="mealEatenOn">食べた日</label>
          <input id="mealEatenOn" name="eatenOn" type="date" required defaultValue={todayLocalDate()} />
        </div>
        <div className="field field--grow">
          <label htmlFor="mealType">タイミング</label>
          <select id="mealType" name="mealType" defaultValue="">
            <option value="">指定なし</option>
            <option value="breakfast">朝</option>
            <option value="lunch">昼</option>
            <option value="dinner">夜</option>
            <option value="snack">間食</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="mealTags">タグ</label>
        <span id="mealTagsHint" className="hint">
          食材などをスペースや読点で区切って（例: じゃがいも 玉ねぎ）
        </span>
        <input id="mealTags" name="tags" aria-describedby="mealTagsHint" />
      </div>
      <div className="field">
        <label htmlFor="mealPhotos">写真</label>
        <span id="mealPhotosHint" className="hint">
          複数選べます。この端末で縮小してから送ります（位置情報は残りません）
        </span>
        <input
          id="mealPhotos"
          type="file"
          accept="image/*"
          multiple
          aria-describedby="mealPhotosHint"
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
      <div className="field">
        <label htmlFor="mealSourceKind">レシピ・リンク</label>
        <select
          id="mealSourceKind"
          value={sourceKind}
          onChange={(e) => setSourceKind(e.currentTarget.value as RecipeSource["type"])}
        >
          <option value="none">なし</option>
          <option value="url">リンクを載せる（レシピ・お店・商品）</option>
          <option value="text">自分でレシピを書く</option>
        </select>
      </div>
      {sourceKind === "url" && (
        <div className="field">
          <label htmlFor="mealUrl">リンク（URL）</label>
          <input id="mealUrl" name="url" type="url" required placeholder="https://…" maxLength={2048} />
        </div>
      )}
      {sourceKind === "text" && (
        <div className="field">
          <label htmlFor="mealRecipeText">レシピ</label>
          <textarea id="mealRecipeText" name="recipeText" required rows={4} maxLength={5000} />
        </div>
      )}
      <div className="field">
        <label htmlFor="mealNote">メモ</label>
        <textarea id="mealNote" name="note" rows={2} maxLength={1000} placeholder="例: 子どもがおかわりした" />
      </div>
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

function MealItem({
  spaceId,
  meal,
  onToggle,
  onRemove,
  onOpenPhoto,
}: {
  spaceId: string;
  meal: Meal;
  onToggle: (m: Meal) => void;
  onRemove: (m: Meal) => void;
  onOpenPhoto: (meal: Meal, photo: MealPhoto) => void;
}) {
  return (
    <li className="list-item list-item--column">
      <div className="row">
        <strong>{meal.name}</strong>
        {meal.mealType && <span className="badge">{MEAL_TYPE_LABEL[meal.mealType]}</span>}
      </div>
      {meal.photos.length > 0 && (
        <ul className="photo-strip" role="list">
          {meal.photos.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                className="photo-thumb"
                onClick={() => onOpenPhoto(meal, p)}
              >
                <img
                  src={mealPhotoUrl(spaceId, meal.id, p.id, p.hasThumb ? "thumb" : undefined)}
                  alt={`${meal.name} の写真 ${i + 1} を拡大`}
                  width={p.width}
                  height={p.height}
                  loading="lazy"
                  decoding="async"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
      {meal.tags.length > 0 && (
        <div className="row">
          {meal.tags.map((t) => (
            <span key={t.id} className="badge">
              {t.name}
            </span>
          ))}
        </div>
      )}
      {meal.recipeSource.type === "url" && (
        <a href={meal.recipeSource.url} target="_blank" rel="noreferrer">
          {linkLabel(meal.recipeSource.url)}
        </a>
      )}
      {meal.recipeSource.type === "text" && (
        <details>
          <summary>レシピ</summary>
          <p className="pre-wrap">{meal.recipeSource.text}</p>
        </details>
      )}
      {meal.note && <p className="muted pre-wrap">{meal.note}</p>}
      <div className="row row--between">
        <span className="muted">{meal.createdByName} が記録</span>
        <div className="row">
          <button
            type="button"
            className="btn btn--small"
            aria-pressed={meal.mataTabetai}
            onClick={() => onToggle(meal)}
          >
            <span aria-hidden="true">{meal.mataTabetai ? "♥" : "♡"}</span> またたべたい
            <span className="visually-hidden">（{meal.name}）</span>
          </button>
          <button type="button" className="btn btn--danger btn--small" onClick={() => onRemove(meal)}>
            削除<span className="visually-hidden">（{meal.name}）</span>
          </button>
        </div>
      </div>
    </li>
  );
}

// リンクはドメイン名で示す（URL 全文はモバイルで長すぎる）
function linkLabel(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "リンク";
  }
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
